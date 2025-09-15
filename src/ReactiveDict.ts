import EJSON from 'ejson';

import Data from './Data';

/**
 * Serialize a value using EJSON. We represent `undefined` explicitly as
 * the string `'undefined'` so that `get` can distinguish between a missing
 * key and a key set to `undefined`.
 */
const stringify = function (value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  return EJSON.stringify(value);
};

const parse = function (serialized?: string): unknown {
  if (serialized === undefined || serialized === 'undefined') {
    return undefined;
  }
  return EJSON.parse(serialized as string);
};

const ObjectID = (globalThis as any).ObjectID;

export default class ReactiveDict {
  public keys: Record<string, string>;

  constructor(dictName?: string | Record<string, unknown>) {
    this.keys = {};
    if (dictName && typeof dictName === 'object') {
      for (const k of Object.keys(dictName)) {
        this.keys[k] = stringify((dictName as Record<string, unknown>)[k]);
      }
    }
  }

  set(keyOrObject: string | Record<string, unknown>, value?: unknown): void {
    if (typeof keyOrObject === 'object' && value === undefined) {
      this._setObject(keyOrObject as Record<string, unknown>);
      return;
    }

    const key = keyOrObject as string;

    const serialized = stringify(value);

    let oldSerializedValue = 'undefined';
    if (Object.prototype.hasOwnProperty.call(this.keys, key)) {
      oldSerializedValue = this.keys[key];
    }
    if (serialized === oldSerializedValue) return;

    this.keys[key] = serialized;

    Data.notify('change');
  }

  setDefault(key: string, value: unknown): void {
    if (this.keys[key] === undefined) {
      this.set(key, value);
    }
  }

  get(key: string): unknown {
    return parse(this.keys[key]);
  }

  equals(key: string, value: unknown): boolean {
    // Only allow scalar values for equals to avoid issues with object key ordering.
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean' &&
      typeof value !== 'undefined' &&
      !(value instanceof Date) &&
      !(ObjectID && value instanceof ObjectID) &&
      value !== null
    ) {
      throw new Error('ReactiveDict.equals: value must be scalar');
    }

    let oldValue: unknown = undefined;
    if (Object.prototype.hasOwnProperty.call(this.keys, key)) {
      oldValue = parse(this.keys[key]);
    }
    return EJSON.equals(oldValue, value);
  }

  _setObject(object: Record<string, unknown>): void {
    const keys = Object.keys(object);

    // Iterate keys and set each value. The original implementation used a
    // `for...in` over the keys array which iterated indices; here we use the
    // intended behavior and iterate actual key names.
    for (const k of keys) {
      this.set(k, object[k]);
    }
  }
}
