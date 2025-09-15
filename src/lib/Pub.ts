/**
 * @author Piotr Falba
 * @author Wei Zhuo
 * @author Jakub Kania
 * @author Nyby
 */

import { findKey, uniq } from 'lodash';
import Meteor from '../Meteor';
import EJSON from 'ejson';

type Param = unknown;
type ParamsArray = Param[];

/** Minimal shape of a Meteor subscription handle used in this module */
export interface SubscriptionHandle {
  subscriptionId: string;
  stop(): void;
}

/** Shape of subscription records stored inside Meteor.getData().subscriptions */
interface MeteorStoredSubscription {
  name: string;
  params: ParamsArray;
}

/** Shape of local subscription entry that tracks refs */
interface LocalSubEntry {
  subscription: SubscriptionHandle;
  refs: string[];
}

function paramsForSub(params: Param | ParamsArray | undefined): ParamsArray {
  if (Array.isArray(params)) {
    return params;
  }
  return typeof params === 'undefined' ? [] : [params];
}

function findExistingSubscriptionId(
  name: string,
  params: Param | ParamsArray | undefined
): string | undefined {
  // Meteor.getData().subscriptions is expected to be a record keyed by subscription id
  // with values that include name and params (both used for matching).
  const subs = Meteor.getData().subscriptions as Record<string, MeteorStoredSubscription>;
  return findKey(subs, {
    name,
    params: EJSON.clone(paramsForSub(params)) as ParamsArray,
  });
}

function info(msg: string): void {
  console.info(`Pub: ${msg}`);
}

class Pub {
  private subs: Record<string, LocalSubEntry> = {};

  private _debugRefs(id: string): string {
    const entry = this.subs[id];
    if (entry) {
      return `subId=${id}, refs(${entry.refs.length})=${entry.refs}`;
    }
    return 'not found';
  }

  subscribe(name: string, params: Param | ParamsArray | undefined, refId: string): SubscriptionHandle {
    let id = findExistingSubscriptionId(name, params);

    if (!id || !this.subs[id]) {
      if (Meteor.isVerbose()) {
        const p = JSON.stringify(paramsForSub(params));
        info(`New subscription ${name}(${p}), refId=${refId}`);
      }
      const args: any[] = [name, ...paramsForSub(params)];
      const subscription = (Meteor.subscribe as any).apply(Meteor, args) as SubscriptionHandle;
      id = subscription.subscriptionId;
      this.subs[id] = { subscription, refs: [] };
    } else {
      if (Meteor.isVerbose()) {
        const p = JSON.stringify(paramsForSub(params));
        info(`Existing subscription ${name}(${p}), subId=${id}, refId=${refId}`);
      }
    }

    // At this point `id` is guaranteed to be defined and this.subs[id] exists.
    const entry = this.subs[id]!;
    entry.refs = uniq<string>([...entry.refs, refId]);
    if (Meteor.isVerbose()) {
      info(`Subscribe ${this._debugRefs(id)}`);
    }
    return entry.subscription;
  }

  stop(subscription: SubscriptionHandle, refId: string): void {
    const id = subscription.subscriptionId;
    if (!id || !this.subs[id]) {
      return;
    }
    const entry = this.subs[id]!;
    entry.refs = entry.refs.filter((i) => i !== refId);
    if (Meteor.isVerbose()) {
      info(`Stop subscription ${this._debugRefs(id)}`);
    }
    if (entry.refs.length === 0) {
      if (Meteor.isVerbose()) {
        info(`Pub: Delete subscription subId=${id}`);
      }
      delete this.subs[id];
      subscription.stop();
    }
  }
}

export default new Pub();
