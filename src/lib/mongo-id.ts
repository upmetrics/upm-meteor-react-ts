// https://github.com/meteor/meteor/tree/master/packages/mongo-id
import EJSON from 'ejson';
import Random from './Random';

/**
 * Lightweight typings for external modules used in this file.
 * We cast the imported modules to these shapes so this file can be strict-typed
 * without requiring changes to the other modules.
 */
type RandomType = { hexString(length: number): string };
const _Random = Random as unknown as RandomType;

type EJSONType = { addType(name: string, factory: (str: string) => unknown): void };
const _EJSON = EJSON as unknown as EJSONType;

/**
 * ObjectID class with strict typing. Mirrors original Meteor implementation.
 */
export class ObjectID {
  private _str: string;

  constructor(hexString?: string) {
    if (hexString) {
      const normalized = hexString.toLowerCase();
      if (!ObjectID._looksLikeObjectID(normalized)) {
        throw new Error('Invalid hexadecimal string for creating an ObjectID');
      }
      // meant to work with _.isEqual(), which relies on structural equality
      this._str = normalized;
    } else {
      this._str = _Random.hexString(24);
    }
  }

  toString(): string {
    return 'ObjectID("' + this._str + '")';
  }

  equals(other: unknown): boolean {
    return other instanceof ObjectID && this.valueOf() === other.valueOf();
  }

  clone(): ObjectID {
    return new ObjectID(this._str);
  }

  typeName(): string {
    return 'oid';
  }

  getTimestamp(): number {
    return parseInt(this._str.substr(0, 8), 16);
  }

  valueOf(): string {
    return this._str;
  }

  toJSONValue(): string {
    return this.valueOf();
  }

  toHexString(): string {
    return this.valueOf();
  }

  // Static helper kept on the class for reuse
  static _looksLikeObjectID(str: string): boolean {
    return str.length === 24 && /^[0-9a-f]*$/.test(str);
  }
}

/**
 * The exported MongoID namespace object shape.
 */
export interface MongoIDNamespace {
  ObjectID: typeof ObjectID;
  _looksLikeObjectID: (str: string) => boolean;
  idStringify: (id: unknown) => string;
  idParse: (id: string) => unknown;
}

/**
 * Implementation of the MongoID namespace mirroring original behavior.
 */
export const MongoID: MongoIDNamespace = {
  ObjectID,

  _looksLikeObjectID(str: string): boolean {
    return ObjectID._looksLikeObjectID(str);
  },

  idStringify(id: unknown): string {
    // ObjectID
    if (id instanceof ObjectID) {
      return id.valueOf();
    }

    // string
    if (typeof id === 'string') {
      if (id === '') {
        return id;
      } else if (
        id.substr(0, 1) === '-' || // escape previously dashed strings
        id.substr(0, 1) === '~' || // escape escaped numbers, true, false
        MongoID._looksLikeObjectID(id) || // escape object-id-form strings
        id.substr(0, 1) === '{'
      ) {
        // escape object-form strings, for maybe implementing later
        return '-' + id;
      }
      return id; // other strings go through unchanged.
    }

    // undefined
    if (id === undefined) {
      return '-';
    }

    // objects (but not null) are not supported as ids
    if (typeof id === 'object' && id !== null) {
      throw new Error('Meteor does not currently support objects other than ObjectID as ids');
    }

    // Numbers, true, false, null
    return '~' + JSON.stringify(id);
  },

  idParse(id: string): unknown {
    if (id === '') {
      return id;
    } else if (id === '-') {
      return undefined;
    } else if (id.substr(0, 1) === '-') {
      return id.substr(1);
    } else if (id.substr(0, 1) === '~') {
      return JSON.parse(id.substr(1));
    } else if (MongoID._looksLikeObjectID(id)) {
      return new ObjectID(id);
    }
    return id;
  },
};

/**
 * Register the 'oid' EJSON type so EJSON can deserialize ObjectIDs.
 */
_EJSON.addType('oid', (str: string) => new ObjectID(str));
