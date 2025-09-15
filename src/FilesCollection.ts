// /d:/Dipak/test/testMeteorApp/upm-meteor-react-js/src/FilesCollection.ts
// Minimal FilesCollection implementation for Meteor-like usage in React
// Accepts a `collection` option (should be a Meteor.Mongo.Collection instance)

import Mongo from './Mongo';

/**
 * Minimal collection interface used by FilesCollection.
 * Only the methods used by this file are declared.
 */
export interface ICollection<TDocument extends Record<string, unknown>> {
  insert(doc: TDocument): string;
  find(selector?: unknown, options?: unknown): unknown;
  remove(selector: unknown): number;
}

/**
 * Shape of file metadata (extendable).
 */
export interface FileMeta {
  name?: string;
  size?: number;
  type?: string;
  [key: string]: unknown;
}

/**
 * File document provided to insert/upload.
 * - `_id` may be added by the backend.
 * - `file` is present for upload operations (could be a File, Blob, stream, etc).
 * - `onError` is an optional callback used by Upload flow.
 */
export interface FileDoc {
  _id?: string;
  file?: File | Blob | unknown;
  meta?: FileMeta;
  onError?: (error: Error) => void;
  [key: string]: unknown;
}

/**
 * The file object after upload: same as FileDoc but guaranteed to have an `_id`.
 */
export type UploadedFileDoc = FileDoc & { _id: string };

/**
 * Minimal typing for the Mongo import object expected shape.
 * We cast the imported Mongo to this type at runtime.
 */
type MongoModuleLike = {
  Collection: new (name?: string) => ICollection<Record<string, unknown>>;
};

const MongoModule = Mongo as unknown as MongoModuleLike;

/* Upload event handler types */
type StartHandler = () => void;
type EndHandler = (error: Error | null, fileObj?: UploadedFileDoc) => void;

/**
 * Upload class simulates an asynchronous upload and emits events.
 * Parameterized by the FileDoc type used.
 */
export class Upload<T extends FileDoc = FileDoc> {
  private _events: {
    start?: StartHandler[];
    end?: EndHandler[];
  } = {};

  public readonly fileDoc: T;
  public readonly collection: ICollection<T>;
  public readonly onAfterUpload?: (file: UploadedFileDoc) => void;

  constructor(fileDoc: T, collection: ICollection<T>, onAfterUpload?: (file: UploadedFileDoc) => void) {
    this.fileDoc = fileDoc;
    this.collection = collection;
    this.onAfterUpload = onAfterUpload;

    // Simulate async upload
    setTimeout(() => {
      this._emit('start');
      // Simulate upload (success or error)
      setTimeout(() => {
        let error: Error | null = null;
        const fileObj: UploadedFileDoc = { ...(fileDoc as Record<string, unknown>), _id: Math.random().toString(36).slice(2) } as UploadedFileDoc;
        try {
          // Insert into the collection (may throw)
          // The collection insert returns an id string in our interface; we ignore it here.
          this.collection.insert(fileObj as T);
        } catch (e) {
          error = e instanceof Error ? e : new Error(String(e));
        }

        if (!error && typeof this.onAfterUpload === 'function') {
          try {
            this.onAfterUpload(fileObj);
          } catch {
            /* ignore errors thrown by onAfterUpload */
          }
        }

        this._emit('end', error, fileObj);

        if (fileDoc.onError && error) {
          try {
            fileDoc.onError(error);
          } catch {
            /* ignore errors thrown by onError callback */
          }
        }
      }, 100);
    }, 10);
  }

  on(event: 'start', handler: StartHandler): this;
  on(event: 'end', handler: EndHandler): this;
  on(event: 'start' | 'end', handler: StartHandler | EndHandler): this {
    if (event === 'start') {
      this._events.start = this._events.start || [];
      (this._events.start as StartHandler[]).push(handler as StartHandler);
    } else {
      this._events.end = this._events.end || [];
      (this._events.end as EndHandler[]).push(handler as EndHandler);
    }
    return this;
  }

  private _emit(event: 'start'): void;
  private _emit(event: 'end', ...args: Parameters<EndHandler>): void;
  private _emit(event: 'start' | 'end', ...args: unknown[]): void {
    if (event === 'start') {
      (this._events.start || []).forEach((fn) => {
        try {
          fn();
        } catch {
          /* swallow handler errors */
        }
      });
    } else {
      (this._events.end || []).forEach((fn) => {
        try {
          (fn as EndHandler)(args[0] as Error | null, args[1] as UploadedFileDoc | undefined);
        } catch {
          /* swallow handler errors */
        }
      });
    }
  }
}

/**
 * FilesCollection provides a small wrapper around a Meteor-like collection
 * for storing file documents and simulating uploads.
 */
export default class FilesCollection<T extends FileDoc = FileDoc> {
  public readonly collection: ICollection<T>;
  public readonly onAfterUpload?: (file: UploadedFileDoc) => void;

  constructor(options: {
    collection?: ICollection<T>;
    collectionName?: string;
    onAfterUpload?: (file: UploadedFileDoc) => void;
  } = {}) {
    if (!options.collection && !options.collectionName) {
      throw new Error('FilesCollection requires a `collection` or `collectionName` option');
    }

    if (options.collection) {
      this.collection = options.collection;
    } else {
      // Create a new Meteor.Mongo.Collection if only collectionName is given
      // Cast to our minimal ICollection type via the known shape of MongoModule.
      this.collection = new MongoModule.Collection(options.collectionName) as ICollection<T>;
    }

    this.onAfterUpload = options.onAfterUpload;
  }

  /**
   * Insert either a direct document or start an upload if `file` is present.
   * Returns an Upload instance for uploads, or the collection insert result for plain inserts.
   */
  insert(fileDoc: T, dynamic?: unknown): Upload<T> | string {
    // If fileDoc has file/meta/onError, treat as upload
    if (fileDoc && fileDoc.file) {
      return new Upload<T>(fileDoc, this.collection, this.onAfterUpload);
    }
    // Fallback: insert as document
    return this.collection.insert(fileDoc);
  }

  find(selector?: unknown, options?: unknown): unknown {
    return this.collection.find(selector, options);
  }

  remove(selector: unknown): number {
    return this.collection.remove(selector);
  }
}
