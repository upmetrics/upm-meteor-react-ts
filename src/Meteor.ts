import Tracker from './Tracker';
import EJSON from 'ejson';
import DDP from './lib/ddp';
import Random from './lib/Random';

import Data, { DataManager } from './Data';
import Mongo from './Mongo';
import { Collection, localCollections, runObservers } from './Collection';
import call from './Call';

import withTracker from './components/withTracker';
import useTracker from './components/useTracker';
import usePublication from './components/usePublication';
import useMethod from './components/useMethod';
import Accounts from './user/Accounts';
import ReactiveDict from './ReactiveDict';
import FilesCollection from './FilesCollection';

let isVerbose: boolean = false;

// Small typed helper for Tracker dependency used by subscriptions
type ReadyDeps = { depend: () => void; changed: () => void };

interface SubscriptionEntry {
  id: string;
  subIdRemember: string;
  name: string;
  params: unknown[];
  inactive?: boolean;
  ready: boolean;
  readyDeps: ReadyDeps;
  readyCallback?: (() => void) | null;
  stopCallback?: (() => void) | null;
  error?: unknown;
  stop?: () => void;
}

type SubscriptionsMap = Record<string, SubscriptionEntry>;

const DataService = Data as DataManager;

function debugSub(name: string, params: unknown[]): string {
  const args = JSON.stringify(params).replace(/^\[|\]$/g, '');
  return `"${name}"(${args})`;
}

function info(msg: string, ...rest: unknown[]): void {
  console.info(`DDP: ${msg}`, ...rest);
}

function warn(msg: string, ...rest: unknown[]): void {
  console.warn(`DDP: ${msg}`, ...rest);
}

export const Meteor = {
  isVerbose(): boolean {
    return isVerbose;
  },
  enableVerbose(): void {
    isVerbose = true;
  },
  Random,
  Mongo,
  Tracker,
  FilesCollection,
  EJSON,
  ReactiveDict,
  Accounts,
  Collection,
  withTracker,
  useTracker,
  usePublication,
  useMethod,
  getData(): DataManager {
    return DataService;
  },
  status(): { connected: boolean; status: string } {
    return {
      connected: DataService.ddp ? DataService.ddp.status === 'connected' : false,
      status: DataService.ddp ? (DataService.ddp.status as string) : 'disconnected',
    };
  },
  call,
  disconnect(): void {
    if (DataService.ddp) {
      DataService.ddp.disconnect();
    }
  },
  _subscriptionsRestart(): void {
    for (const i of Object.keys(DataService.subscriptions)) {
      const sub = DataService.subscriptions[i] as unknown as SubscriptionEntry;
      DataService.ddp?.unsub(sub.subIdRemember);
      sub.subIdRemember = DataService.ddp!.sub(sub.name, sub.params as unknown[]);
    }
  },
  waitDdpConnected: DataService.waitDdpConnected.bind(DataService),
  reconnect(): void {
    DataService.ddp && DataService.ddp.connect();
  },
  packageInterface: (): { localStorage?: Storage } => {
    return {
      localStorage,
    };
  },
  connect(endpoint?: string | null, options?: Record<string, any>): void {
    if (!endpoint) {
      endpoint = DataService._endpoint;
    }
    if (!options) {
      options = DataService._options as Record<string, any>;
    }

    if (typeof endpoint === 'string' && (!endpoint.startsWith('ws') || !endpoint.endsWith('/websocket')) && !options.suppressUrlErrors) {
      throw new Error(
        `Your url "${endpoint}" may be in the wrong format. It should start with "ws://" or "wss://" and end with "/websocket", e.g. "wss://myapp.meteor.com/websocket". To disable this warning, connect with option "suppressUrlErrors" as true, e.g. Meteor.connect("${endpoint}", {suppressUrlErrors:true});`
      );
    }

    DataService._endpoint = endpoint as string;
    DataService._options = options;

    (this as any).ddp = DataService.ddp = new DDP({
      endpoint: (endpoint as string) || undefined,
      SocketConstructor: (WebSocket as unknown) as any,
      ...options,
    }) as any;

    (DataService.ddp as any).on('connected', () => {
      // Clear the collections of any stale data in case this is a reconnect
      if ((DataService.db as any) && (DataService.db as any).collections) {
        for (const collection of Object.keys((DataService.db as any).collections)) {
          if (!localCollections.includes(collection)) {
            // Dont clear data from local collections
            (DataService.db as any)[collection].remove({});
          }
        }
      }

      DataService.notify('change');

      if (isVerbose) {
        info(`Connected to DDP server ${endpoint}`);
      }
      (this as any)._loadInitialUser().then(() => {
        (this as any)._subscriptionsRestart();
      });
    });

    let lastDisconnect: Date | null = null;
    (DataService.ddp as any).on('disconnected', () => {
      DataService.notify('change');

      if (isVerbose) {
        info('Disconnected from DDP server.');
      }

      if (!(DataService.ddp as any).autoReconnect) {
        return;
      }

      if (!lastDisconnect || new Date().getTime() - lastDisconnect.getTime() > 3000) {
        (DataService.ddp as any).connect();
      }

      lastDisconnect = new Date();
    });

    (DataService.ddp as any).on('added', (message: any) => {
      if (!DataService.db[message.collection]) {
        (DataService.db as any).addCollection(message.collection);
      }
      const document = {
        _id: message.id,
        ...message.fields,
      } as Record<string, unknown>;

      (DataService.db as any)[message.collection].upsert(document);
      if (isVerbose) {
        info(`Added to "${message.collection}", _id=${message.id}`);
      }
      runObservers('added', message.collection, document);
    });

    (DataService.ddp as any).on('ready', (message: any) => {
      if (isVerbose) {
        info(`Ready subs=${message.subs}`);
      }
      const idsMap = new Map<string, string>();
      for (const i of Object.keys(DataService.subscriptions)) {
        const sub = DataService.subscriptions[i] as unknown as SubscriptionEntry;
        idsMap.set(sub.subIdRemember, sub.id);
      }
      for (const i of Object.keys(message.subs || {})) {
        const subId = idsMap.get(message.subs[i]);
        if (subId) {
          if (isVerbose) {
            info(`Subscription ready subId=${subId}`);
          }
          const sub = DataService.subscriptions[subId] as unknown as SubscriptionEntry;
          sub.ready = true;
          sub.readyDeps.changed();
          sub.readyCallback && sub.readyCallback();
        }
      }
    });

    (DataService.ddp as any).on('changed', (message: any) => {
      const unset: Record<string, null> = {};
      if (isVerbose) {
        info(`Changed to "${message.collection}", _id=${message.id}`);
      }
      if (message.cleared) {
        message.cleared.forEach((field: string) => {
          unset[field] = null;
        });
      }

      if ((DataService.db as any)[message.collection]) {
        const document = {
          _id: message.id,
          ...message.fields,
          ...unset,
        } as Record<string, unknown>;

        const oldDocument = (DataService.db as any)[message.collection].findOne({
          _id: message.id,
        });

        (DataService.db as any)[message.collection].upsert(document);

        runObservers('changed', message.collection, document, oldDocument);
      }
    });

    (DataService.ddp as any).on('removed', (message: any) => {
      if (isVerbose) {
        info(`Removed from "${message.collection}", _id=${message.id}`);
      }
      if ((DataService.db as any)[message.collection]) {
        const oldDocument = (DataService.db as any)[message.collection].findOne({
          _id: message.id,
        });
        (DataService.db as any)[message.collection].del(message.id);
        runObservers('removed', message.collection, oldDocument);
      }
    });

    (DataService.ddp as any).on('result', (message: any) => {
      const c = DataService.calls.find((x: any) => x.id === message.id) as any;
      if (isVerbose) {
        info(`Method result for id=${message.id}`);
      }
      if (c && typeof c.callback === 'function') {
        c.callback(message.error, message.result);
      }
      DataService.calls.splice(
        DataService.calls.findIndex((x: any) => x.id === message.id),
        1
      );
    });

    (DataService.ddp as any).on('nosub', (message: any) => {
      for (const i of Object.keys(DataService.subscriptions)) {
        const sub = DataService.subscriptions[i] as unknown as SubscriptionEntry;
        if (sub.subIdRemember === message.id) {
          if (message.error) {
            sub.error = message.error;
            sub.ready = true;
            sub.readyDeps.changed();
            sub.readyCallback && sub.readyCallback();
            if (isVerbose) {
              warn('Subscription returned error for', sub.name);
            }
          } else {
            if (isVerbose) {
              info('Stop subscription for', sub.name);
            }
          }
        }
      }
    });
  },
  subscribe(name: string, ...params: unknown[]) {
    let callbacks: any = {};
    if (params.length) {
      const lastParam = params[params.length - 1];
      if (typeof lastParam === 'function') {
        callbacks.onReady = params.pop();
      } else if (
        lastParam &&
        (typeof (lastParam as any).onReady === 'function' ||
          typeof (lastParam as any).onError === 'function' ||
          typeof (lastParam as any).onStop === 'function')
      ) {
        callbacks = params.pop();
      }
    }

    // Is there an existing sub with the same name and param, run in an
    // invalidated Computation? This will happen if we are rerunning an
    // existing computation.
    //
    // For example, consider a rerun of:
    //
    //     Tracker.autorun(function () {
    //       Meteor.subscribe("foo", Session.get("foo"));
    //       Meteor.subscribe("bar", Session.get("bar"));
    //     });
    //
    // If "foo" has changed but "bar" has not, we will match the "bar"
    // subscribe to an existing inactive subscription in order to not
    // unsub and resub the subscription unnecessarily.
    //
    // We only look for one such sub; if there are N apparently-identical subs
    // being invalidated, we will require N matching subscribe calls to keep
    // them all active.

    let existing: any = false;
    for (const i of Object.keys(DataService.subscriptions)) {
      const sub = DataService.subscriptions[i] as any;
      if (sub.inactive && sub.name === name && EJSON.equals(sub.params, params)) {
        existing = sub;
      }
    }

    let id: string;
    if (existing) {
      id = existing.id;
      existing.inactive = false;

      if (callbacks.onReady) {
        // If the sub is not already ready, replace any ready callback with the
        // one provided now. (It's not really clear what users would expect for
        // an onReady callback inside an autorun; the semantics we provide is
        // that at the time the sub first becomes ready, we call the last
        // onReady callback provided, if any.)
        if (!existing.ready) {
          existing.readyCallback = callbacks.onReady;
        }
      }
      if (callbacks.onStop) {
        existing.stopCallback = callbacks.onStop;
      }
    } else {
      // New sub! Generate an id, save it locally, and send message.

      id = Random.id();
      const subIdRemember = (DataService.ddp as any).sub(name, params);
      if (isVerbose) {
        info(`Subscribe to ${debugSub(name, params)} subId=${id}, sub=${subIdRemember}`);
      }
      (DataService.subscriptions as any)[id] = {
        id,
        subIdRemember,
        name,
        params: EJSON.clone(params),
        inactive: false,
        ready: false,
        readyDeps: (new (Tracker as any).Dependency()) as ReadyDeps,
        readyCallback: callbacks.onReady,
        stopCallback: callbacks.onStop,
        error: null,
        stop(this: SubscriptionEntry): void {
          (DataService.ddp as any).unsub(this.subIdRemember);
          delete (DataService.subscriptions as any)[this.id];
          this.ready && this.readyDeps.changed();
          if (isVerbose) {
            info(`Stopping ${debugSub(name, params)}  subId=${this.id}, sub=${this.subIdRemember}`);
          }
          if (callbacks.onStop) {
            callbacks.onStop();
          }
        },
      } as unknown as SubscriptionEntry;
    }

    // return a handle to the application.

    /* if (Tracker.active) {
      // We're in a reactive computation, so we'd like to unsubscribe when the
      // computation is invalidated... but not if the rerun just re-subscribes
      // to the same subscription!  When a rerun happens, we use onInvalidate
      // as a change to mark the subscription "inactive" so that it can
      // be reused from the rerun.  If it isn't reused, it's killed from
      // an afterFlush.
      Tracker.onInvalidate(function () {
        if (isVerbose) {
          info(`Tracker.onInvalidate subId=${id}`);
        }
        if ((DataService.subscriptions as any)[id] && (DataService.subscriptions as any)[id].ready) {
          (DataService.subscriptions as any)[id].inactive = true;
        }

        Tracker.afterFlush(function () {
          if (isVerbose) {
            info(`Tracker.afterFlush subId=${id}`);
          }
          if ((DataService.subscriptions as any)[id] && (DataService.subscriptions as any)[id].inactive) {
            handle.stop();
          }
        });
      });
    } */
    return {
      stop(): void {
        if ((DataService.subscriptions as any)[id]) {
          (DataService.subscriptions as any)[id].stop();
        }
      },
      ready(): boolean {
        if (!(DataService.subscriptions as any)[id]) {
          return false;
        }
        const record = (DataService.subscriptions as any)[id] as SubscriptionEntry;
        record.readyDeps.depend();
        return record.ready;
      },
      error(): unknown | null {
        if (!(DataService.subscriptions as any)[id]) {
          return null;
        }
        return ((DataService.subscriptions as any)[id] as SubscriptionEntry).error ?? null;
      },
      subscriptionId: id,
    };
  },
  getSubscriptions() {
    return DataService.subscriptions;
  },
  findSubscriptions(name: string, params?: unknown) {
    return Object.values(DataService.subscriptions).filter((sub: any) => {
      if (sub.name !== name) return false;
      return params ? JSON.stringify(sub.params) === JSON.stringify([params]) : true;
    });
  },
};

export default Meteor;
