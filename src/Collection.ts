import Tracker from './Tracker';
import EJSON from 'ejson';
import { extend, forEach, has } from 'lodash';

import Data from './Data';
import Random from './lib/Random';
import call from './Call';
import { isPlainObject } from './lib/utils.js';

/**
 * Types and interfaces
 */
type Doc = Record<string, any>;

type ObserverType = 'added' | 'changed' | 'removed';

type ObserverCallback = (newDoc: Doc, oldDoc?: Doc) => void;

interface Observer {
  cursor: Cursor;
  callbacks: Partial<Record<ObserverType, ObserverCallback>>;
}

interface UpdateOperation {
  selector: Record<string, any>;
  modifier: Record<string, any>;
}

interface LocalDBCollection {
  find(selector?: any, options?: any): Doc[];
  findOne(selector: any, options?: any): Doc | undefined;
  get(id: string): Doc | undefined;
  upsert(doc: Doc): void;
  del(id: string): void;
}

/**
 * Minimal typing for Data module based on usage in this file.
 * Data.db is a map of collection name -> LocalDBCollection with an addCollection method.
 * Data.waitDdpConnected is a function that takes a callback.
 */
interface DataModule {
  db: {
    [name: string]: LocalDBCollection | undefined;
  } & {
    addCollection(name: string): void;
  };
  waitDdpConnected(cb: () => void): void;
}

const dataModule = Data as unknown as DataModule;

/**
 * Observers store
 */
const observers: Record<string, Observer[]> = {};

/**
 * Notify registered observers about document changes.
 */
export const runObservers = (
  type: ObserverType,
  collection: string,
  newDocument: Doc,
  oldDocument?: Doc
): void => {
  const colObservers = observers[collection];
  if (!colObservers) return;

  colObservers.forEach(({ cursor, callbacks }) => {
    const cb = callbacks[type];
    if (!cb) return;

    if (type === 'removed') {
      // removed only needs the newDocument (which is the removed document)
      cb(newDocument);
      return;
    }

    // For added/changed we ensure the document still matches the cursor selector
    const dbCol = dataModule.db[collection];
    if (
      dbCol &&
      typeof dbCol !== 'function' &&
      dbCol.findOne &&
      dbCol.findOne({
        $and: [{ _id: newDocument._id }, cursor._selector],
      })
    ) {
      try {
        cb(newDocument, oldDocument);
      } catch (e) {
        // Keep behavior consistent with original: log errors but don't throw
        // eslint-disable-next-line no-console
        console.error('Error in observe callback', e);
      }
    }
  });
};

const _registerObserver = (collection: string, cursor: Cursor, callbacks: Observer['callbacks']): void => {
  observers[collection] = observers[collection] || [];
  observers[collection].push({ cursor, callbacks });
};

class Cursor {
  private _docs: Doc[];
  private _collection: Collection;
  public _selector: any;

  constructor(collection: Collection, docs?: Doc[] | Doc, selector?: any) {
    // Accept both single doc or doc array as original code did
    if (!docs) {
      this._docs = [];
    } else if (Array.isArray(docs)) {
      this._docs = docs;
    } else {
      this._docs = [docs];
    }

    this._collection = collection;
    this._selector = selector;
  }

  count(): number {
    return this._docs.length;
  }

  fetch(): Doc[] {
    return this._transformedDocs();
  }

  forEach(callback: (doc: Doc) => void): void {
    this._transformedDocs().forEach(callback);
  }

  map<T>(callback: (doc: Doc) => T): T[] {
    return this._transformedDocs().map(callback);
  }

  _transformedDocs(): Doc[] {
    // _transform may be null
    return this._collection._transform ? this._docs.map(this._collection._transform) : this._docs.slice();
  }

  observe(callbacks: Observer['callbacks']): void {
    _registerObserver(this._collection._name, this, callbacks);
  }
}

export const localCollections: string[] = [];

export class Collection {
  public localCollection?: boolean;
  public _collection: LocalDBCollection;
  public _name: string;
  public _transform: ((doc: Doc) => Doc) | null;
  private _helpers?: new (doc: Doc) => any;

  constructor(name: string | null, options: { transform?: (doc: Doc) => Doc } = {}) {
    if (name === null) {
      this.localCollection = true;
      name = Random.id();
      localCollections.push(name);
    }

    if (!dataModule.db[name]) {
      dataModule.db.addCollection(name);
    }

    const col = dataModule.db[name];
    if (!col) {
      // Defensive typing; should not happen if addCollection behaves correctly
      throw new Error(`Collection ${name} is not available on Data.db`);
    }

    this._collection = col;
    this._name = name;
    this._transform = wrapTransform(options.transform ?? null);
  }

  find(selector?: string | any, options?: any): Cursor {
    let docs: Doc[] | Doc | undefined;

    if (typeof selector === 'string') {
      if (options) {
        docs = this._collection.findOne({ _id: selector }, options);
      } else {
        docs = this._collection.get(selector);
      }

      if (docs) {
        // single document -> make it an array for Cursor
        if (!Array.isArray(docs)) {
          docs = [docs];
        }
      } else {
        docs = [];
      }
    } else {
      docs = this._collection.find(selector, options) || [];
    }

    return new Cursor(this, docs as Doc[], selector);
  }

  findOne(selector?: string | any, options?: any): Doc | undefined {
    const result = this.find(selector, options);
    const fetched = result.fetch();
    return fetched[0];
  }

  insert(item: Doc, callback: (err?: any, id?: string) => void = () => {}): string {
    let id: string;

    if ('_id' in item) {
      if (!item._id || typeof item._id !== 'string') {
        callback('Meteor requires document _id fields to be non-empty strings');
        // original returned callback with error; keep returning undefined-ish behavior by returning empty string
        return '';
      }
      id = item._id;
    } else {
      id = Random.id();
      item._id = id;
    }

    if (this._collection.get(id)) {
      callback({
        error: 409,
        reason: `Duplicate key _id with value ${id}`,
      });
      return id;
    }

    this._collection.upsert(item);

    if (!this.localCollection) {
      dataModule.waitDdpConnected(() => {
        call(`/${this._name}/insert`, item, (err?: any) => {
          if (err) {
            this._collection.del(id);
            callback(err);
            return;
          }

          callback(null, id);
        });
      });
    }

    return id;
  }

  update(id: string, modifier: Record<string, any>, options: any = {}, callback: (err?: any, res?: any) => void = () => {}): void {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    const existingDoc = this._collection.get(id);

    // Optimistic local update if we have an existing doc and $set
    if (existingDoc && modifier && modifier.$set) {
      this._collection.upsert({ _id: id, ...modifier.$set });
    }

    if (!this.localCollection) {
      dataModule.waitDdpConnected(() => {
        // Try the standard Meteor collection update pattern first
        call(`/${this._name}/update`, { _id: id }, modifier, (err?: any) => {
          if (err && err.error === 404 && err.reason && err.reason.includes('not found')) {
            // Fallback: Try alternative method patterns that might exist on your server
            this._tryAlternativeUpdateMethods(id, modifier, callback);
          } else if (err) {
            // Rollback optimistic update on error
            if (existingDoc && modifier.$set) {
              this._collection.upsert(existingDoc);
            }
            callback(err);
          } else {
            callback(null, id);
          }
        });
      });
    }
  }

  private _tryAlternativeUpdateMethods(id: string, modifier: Record<string, any>, callback: (err?: any, res?: any) => void): void {
    // Console logs mirror original debugging behavior
    // eslint-disable-next-line no-console
    console.log(`Trying alternative update methods for ${this._name}`);

    const alternatives: string[] = [
      `${this._name}.update`,
      `update${this._name}`,
      `/${this._name}/modify`,
      `/modify/${this._name}`,
    ];

    let attempted = 0;

    const tryNext = (): void => {
      if (attempted >= alternatives.length) {
        callback({
          error: 404,
          reason: `No update method found for collection ${this._name}. Tried: ${alternatives.join(', ')}`,
        });
        return;
      }

      const methodName = alternatives[attempted++];
      // eslint-disable-next-line no-console
      console.log(`Trying method: ${methodName}`);

      call(methodName, { _id: id }, modifier, (err?: any) => {
        if (err && err.error === 404) {
          tryNext();
        } else if (err) {
          callback(err);
        } else {
          // eslint-disable-next-line no-console
          console.log(`Success with method: ${methodName}`);
          callback(null, id);
        }
      });
    };

    tryNext();
  }

  bulkUpdate(updates: UpdateOperation[], options: any = {}, callback: (err?: any, res?: any) => void = () => {}): void {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    if (!Array.isArray(updates)) {
      callback({
        error: 400,
        reason: 'bulkUpdate expects an array of update operations',
      });
      return;
    }

    // Optimistic local updates
    updates.forEach(({ selector, modifier }) => {
      if (selector._id && modifier.$set) {
        const existingDoc = this._collection.get(selector._id);
        if (existingDoc) {
          this._collection.upsert({ _id: selector._id, ...modifier.$set });
        }
      }
    });

    if (!this.localCollection) {
      dataModule.waitDdpConnected(() => {
        call(`/${this._name}/bulkUpdate`, updates, (err?: any, result?: any) => {
          if (
            err &&
            err.error === 404 &&
            err.reason &&
            (typeof err.reason === 'string' && err.reason.includes('not found'))
          ) {
            // Fallback: Method not found, try using individual updates
            // eslint-disable-next-line no-console
            console.warn(`Method /${this._name}/bulkUpdate not found, falling back to individual updates`);
            this._fallbackBulkUpdate(updates, callback);
          } else if (err) {
            // Rollback optimistic updates on error
            // (left intentionally minimal - subscription system may fix)
            callback(err);
          } else {
            callback(null, result);
          }
        });
      });
    } else {
      // Local collection behavior
      const results = updates.map(({ selector, modifier }) => {
        if (selector._id) {
          const doc = this._collection.get(selector._id);
          if (doc && modifier.$set) {
            this._collection.upsert({ ...doc, ...modifier.$set });
            return { _id: selector._id, success: true };
          }
        }
        return { selector, success: false, reason: 'Document not found or invalid modifier' };
      });
      callback(null, results);
    }
  }

  updateMany(selector: any, modifier: Record<string, any>, options: any = {}, callback: (err?: any, res?: any) => void = () => {}): void {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    if (!this.localCollection) {
      dataModule.waitDdpConnected(() => {
        call(`/${this._name}/updateMany`, selector, modifier, (err?: any, result?: any) => {
          if (
            err &&
            err.error === 404 &&
            err.reason &&
            (typeof err.reason === 'string' && err.reason.includes('not found'))
          ) {
            // eslint-disable-next-line no-console
            console.warn(`Method /${this._name}/updateMany not found, falling back to individual updates`);
            this._fallbackUpdateMany(selector, modifier, callback);
          } else if (err) {
            callback(err);
          } else {
            callback(null, result);
          }
        });
      });
    } else {
      // Local collection: update matched documents
      const docs = this._collection.find(selector) || [];
      const updated: string[] = [];

      docs.forEach((doc) => {
        if (modifier.$set) {
          this._collection.upsert({ ...doc, ...modifier.$set });
          if (doc._id) updated.push(doc._id);
        }
      });

      callback(null, { modifiedCount: updated.length, matchedCount: docs.length });
    }
  }

  private _fallbackBulkUpdate(updates: UpdateOperation[], callback: (err?: any, res?: any) => void): void {
    // eslint-disable-next-line no-console
    console.log('Using fallback bulkUpdate implementation');

    let completed = 0;
    const results: any[] = [];

    updates.forEach((update, index) => {
      const { selector, modifier } = update;

      if (selector._id) {
        this.update(selector._id, modifier, (err?: any) => {
          completed++;

          if (err) {
            results[index] = {
              index,
              selector,
              success: false,
              error: err.reason || err.message || 'Update failed',
            };
          } else {
            results[index] = {
              index,
              selector,
              success: true,
              modifiedCount: 1,
            };
          }

          if (completed === updates.length) {
            callback(null, results);
          }
        });
      } else {
        completed++;
        results[index] = {
          index,
          selector,
          success: false,
          error: 'Fallback bulkUpdate only supports _id selectors',
        };

        if (completed === updates.length) {
          callback(null, results);
        }
      }
    });

    if (updates.length === 0) {
      callback(null, []);
    }
  }

  private _fallbackUpdateMany(selector: any, modifier: Record<string, any>, callback: (err?: any, res?: any) => void): void {
    // eslint-disable-next-line no-console
    console.log('Using fallback updateMany implementation');

    if (selector._id && selector._id.$in && Array.isArray(selector._id.$in)) {
      const ids: string[] = selector._id.$in;
      let completed = 0;
      let modifiedCount = 0;
      const errors: any[] = [];

      ids.forEach((id: string) => {
        this.update(id, modifier, (err?: any) => {
          completed++;
          if (err) {
            errors.push({ id, error: err });
          } else {
            modifiedCount++;
          }

          if (completed === ids.length) {
            if (errors.length > 0) {
              // eslint-disable-next-line no-console
              console.warn('Some updates failed:', errors);
            }
            callback(null, {
              modifiedCount,
              matchedCount: ids.length,
              errors: errors.length > 0 ? errors : undefined,
            });
          }
        });
      });
    } else {
      callback({
        error: 500,
        reason:
          'updateMany fallback only supports _id.$in selectors. Please implement server method or use individual updates.',
      });
    }
  }

  remove(id: string, callback: (err?: any, res?: any) => void = () => {}): void {
    const element = this.findOne(id);

    if (element) {
      this._collection.del(element._id);

      if (!this.localCollection) {
        dataModule.waitDdpConnected(() => {
          call(`/${this._name}/remove`, { _id: id }, (err?: any, res?: any) => {
            if (err) {
              this._collection.upsert(element);
              callback(err);
              return;
            }
            callback(null, res);
          });
        });
      }
    } else {
      callback(`No document with _id : ${id}`);
    }
  }

  helpers(helpers: Record<string, Function>): void {
    let _transform: ((doc: Doc) => Doc) | undefined;

    if (this._transform && !this._helpers) {
      _transform = this._transform;
    }

    if (!this._helpers) {
      this._helpers = function Document(this: any, doc: Doc) {
        return extend(this, doc);
      } as unknown as new (doc: Doc) => any;

      this._transform = (doc: Doc) => {
        if (_transform) {
          doc = _transform(doc);
        }
        return new (this._helpers as any)(doc);
      };
    }

    forEach(helpers, (helper: Function, key: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (this._helpers as any).prototype[key] = helper;
    });
  }

  testAvailableMethods(callback: (methods: string[]) => void = () => {}): void {
    const testMethods: string[] = [
      `/${this._name}/update`,
      `${this._name}.update`,
      `update${this._name}`,
      `/${this._name}/modify`,
      `modify${this._name}`,
      `updateMany${this._name}`,
      `/${this._name}/updateMany`,
    ];

    // eslint-disable-next-line no-console
    console.log(`Testing available methods for collection: ${this._name}`);
    const availableMethods: string[] = [];
    let tested = 0;

    testMethods.forEach((methodName: string) => {
      call(methodName, { _id: 'test' }, { $set: { test: true } }, (err?: any) => {
        tested++;

        if (err && err.error === 404) {
          // eslint-disable-next-line no-console
          console.log(`❌ Method not available: ${methodName}`);
        } else if (err && err.reason && typeof err.reason === 'string' && err.reason.includes('not authorized')) {
          // eslint-disable-next-line no-console
          console.log(`🔒 Method exists but requires auth: ${methodName}`);
          availableMethods.push(methodName);
        } else if (err) {
          // eslint-disable-next-line no-console
          console.log(`⚠️  Method exists but errored: ${methodName} - ${err.reason}`);
          availableMethods.push(methodName);
        } else {
          // eslint-disable-next-line no-console
          console.log(`✅ Method available: ${methodName}`);
          availableMethods.push(methodName);
        }

        if (tested === testMethods.length) {
          // eslint-disable-next-line no-console
          console.log(`Available methods for ${this._name}:`, availableMethods);
          callback(availableMethods);
        }
      });
    });
  }
}

/**
 * Wrap a transform function to always preserve _id and ensure returned object shape.
 * This mirrors Meteor's behavior described in the original file.
 */
type TransformFn = (doc: Doc) => Doc;
type WrappedTransform = TransformFn & { __wrappedTransform__?: boolean };

function wrapTransform(transform: TransformFn | WrappedTransform | null): WrappedTransform | null {
  if (!transform) {
    return null;
  }

  if ((transform as WrappedTransform).__wrappedTransform__) {
    return transform as WrappedTransform;
  }

  const wrapped: WrappedTransform = function (doc: Doc): Doc {
    if (!has(doc, '_id')) {
      throw new Error('can only transform documents with _id');
    }

    const id = doc._id;
    const transformed = (Tracker as any).nonreactive(function () {
      return transform(doc);
    });

    if (!isPlainObject(transformed)) {
      throw new Error('transform must return object');
    }

    if (has(transformed, '_id')) {
      if (!EJSON.equals((transformed as Doc)._id, id)) {
        throw new Error("transformed document can't have different _id");
      }
    } else {
      (transformed as Doc)._id = id;
    }
    return transformed as Doc;
  } as WrappedTransform;

  wrapped.__wrappedTransform__ = true;
  return wrapped;
}
