// src/Data.ts
import ReactDOM from 'react-dom';
import minimongo from '@meteorrn/minimongo';
import Tracker from './Tracker';
import setImmediate from 'set-immediate-shim';

// Ensure a minimal `process.nextTick` is available at runtime. Some bundlers
// (esbuild/vite) do not automatically polyfill `process` and packages like
// `@meteorrn/minimongo` expect `process.nextTick` to exist. Use
// `globalThis.process` so this works in browser-like environments.
const globalProcess = (globalThis as any).process || {};
if (typeof globalProcess.nextTick !== 'function') {
  globalProcess.nextTick = setImmediate;
}
(globalThis as any).process = globalProcess;

/**
 * Minimal typed surface of the minimongo instance used here.
 * We only type the members that this module uses.
 */
type EventCallback = () => void;

interface LocalDBCollection {
  find(selector?: any, options?: any): Record<string, any>[];
  findOne(selector: any, options?: any): Record<string, any> | undefined;
  get(id: string): Record<string, any> | undefined;
  upsert(doc: Record<string, any>): void;
  del(id: string): void;
  remove?(query?: any): void;
}

interface MinimongoDb {
  debug: boolean;
  batchedUpdates?: (cb: () => void) => void;
  on(event: string, cb: EventCallback): void;
  off(event: string, cb: EventCallback): void;
  // runtime shape used elsewhere: collections map and addCollection function
  collections?: Record<string, any>;
  addCollection?(name: string): void;
  [name: string]: any;
}

/**
 * Minimal typed surface of the DDP client used here.  This is intentionally
 * broader than the original minimal shape so higher-level modules like
 * `Meteor.ts` can use runtime DDP methods (connect/disconnect/sub/unsub/method)
 * while keeping strict typing.
 */
type DdpStatus = 'connected' | 'disconnected' | string;

interface DdpClient {
  status?: DdpStatus;
  autoReconnect?: boolean;
  // event handlers receive an optional message payload for most events
  on(event: string, cb: (...args: unknown[]) => void): void;
  off(event: string, cb: (...args: unknown[]) => void): void;
  once(event: string, cb: (...args: unknown[]) => void): void;

  // control methods
  connect(): void;
  disconnect(): void;

  // outgoing actions
  method(name: string, params?: unknown[]): string | number;
  sub(name: string, params?: unknown[]): string;
  unsub(id: string): string;
}

/**
 * Call shape is unknown to this module; use unknown to avoid `any`.
 */
type CallRecord = unknown;

/**
 * Subscriptions keyed by string, values are unknown to this module.
 */
type Subscriptions = Record<string, unknown>;

interface CallbackEntry {
  eventName: string;
  callback: EventCallback;
}

export interface DataManager {
  _endpoint: string | null;
  _options: Record<string, unknown>;
  ddp: DdpClient | null;
  subscriptions: Subscriptions;
  db: MinimongoDb & Record<string, LocalDBCollection | undefined>;
  calls: CallRecord[];
  getUrl(): string;
  waitDdpReady(cb: EventCallback): void;
  _cbs: CallbackEntry[];
  onChange(cb: EventCallback): void;
  offChange(cb: EventCallback): void;
  on(eventName: string, cb: EventCallback): void;
  off(eventName: string, cb: EventCallback): void;
  notify(eventName: string): void;
  waitDdpConnected(cb: EventCallback): void;
}

/**
 * Create the minimongo instance and assert it conforms to our MinimongoDb.
 * The `@meteorrn/minimongo` package may export the LocalCollection in a few
 * different shapes (named export, default export, factory function, or the
 * constructor itself). Try several known shapes so this works across
 * bundlers and transpilation targets.
 */
function makeLocalCollection(m: any): MinimongoDb {
  const candidates = [
    m && m.LocalCollection,
    m && m.default && m.default.LocalCollection,
    m,
    m && m.default,
  ];

  for (const C of candidates) {
    if (typeof C === 'function') {
      try {
        return new C();
      } catch (e) {
        // ignore and continue trying other shapes
      }
    }
  }

  if (typeof (m && m.LocalCollectionFactory) === 'function') {
    return m.LocalCollectionFactory();
  }

  throw new Error('Unable to construct LocalCollection from @meteorrn/minimongo import');
}

const db = makeLocalCollection(minimongo) as MinimongoDb;
db.debug = false;
db.batchedUpdates = ReactDOM.unstable_batchedUpdates;

/** Helper to run a function after Tracker flush */
function runAfterOtherComputations(fn: () => void): void {
  (Tracker as any).afterFlush(() => fn());
}

const Data: DataManager = {
  _endpoint: null,
  _options: {},
  ddp: null,
  subscriptions: {},
  db,
  calls: [],

  getUrl(): string {
    // The original implementation assumed _endpoint is non-null; keep that behavior
    // with non-null assertion so callers get the substring result as before.
    return this._endpoint!.substring(0, this._endpoint!.indexOf('/websocket'));
  },

  waitDdpReady(cb: EventCallback): void {
    if (this.ddp) {
      cb();
    } else {
      runAfterOtherComputations(() => this.waitDdpReady(cb));
    }
  },

  _cbs: [],
  onChange(cb: EventCallback): void {
    this.db.on('change', cb);
    this.ddp?.on('connected', cb);
    this.ddp?.on('disconnected', cb);
    this.on('loggingIn', cb);
    this.on('change', cb);
  },
  offChange(cb: EventCallback): void {
    this.db.off('change', cb);
    this.ddp?.off('connected', cb);
    this.ddp?.off('disconnected', cb);
    this.off('loggingIn', cb);
    this.off('change', cb);
  },
  on(eventName: string, cb: EventCallback): void {
    this._cbs.push({ eventName, callback: cb });
  },
  off(eventName: string, cb: EventCallback): void {
    const idx = this._cbs.findIndex((_cb) => _cb.callback === cb && _cb.eventName === eventName);
    if (idx !== -1) {
      this._cbs.splice(idx, 1);
    }
  },
  notify(eventName: string): void {
    // use forEach to iterate; original used map but its return value was ignored
    this._cbs.forEach((cb) => {
      if (cb.eventName === eventName && typeof cb.callback === 'function') {
        cb.callback();
      }
    });
  },
  waitDdpConnected(cb: EventCallback): void {
    if (this.ddp && this.ddp.status === 'connected') {
      cb();
    } else if (this.ddp) {
      this.ddp.once('connected', cb);
    } else {
      setTimeout(() => this.waitDdpConnected(cb), 10);
    }
  },
};

export default Data;
