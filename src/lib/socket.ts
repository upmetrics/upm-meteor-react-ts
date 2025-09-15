import EventEmitter from 'wolfy87-eventemitter';
import EJSON from 'ejson';
import './mongo-id'; //  Register mongo object ids

// Minimal typed shape we expect from the underlying socket implementation.
export interface RawSocket {
  send(data: string): void;
  close(): void;
  onopen?: (() => void) | null;
  onclose?: (() => void) | null;
  onmessage?: ((message: { data: string }) => void) | null;
}

// Constructor type for the socket implementation (e.g. WebSocket-like).
export type SocketConstructor = new (endpoint: string) => RawSocket;

// Minimal typed EventEmitter surface used by this module.
// We cast the imported EventEmitter constructor to this shape so we get
// proper static/instance typing without requiring external typings.
declare class TypedEventEmitter {
  emit(event: string, ...args: unknown[]): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

// The runtime EventEmitter is provided by 'wolfy87-eventemitter'.
// We cast it to a newable TypedEventEmitter for static typing.
const EventEmitterCtor = EventEmitter as unknown as { new (): TypedEventEmitter };

export default class Socket extends EventEmitterCtor {
  private readonly SocketConstructor: SocketConstructor;
  private readonly endpoint: string;
  public rawSocket: RawSocket | null = null;
  private closing = false;

  constructor(SocketConstructor: SocketConstructor, endpoint: string) {
    super();
    this.SocketConstructor = SocketConstructor;
    this.endpoint = endpoint;
    this.rawSocket = null;
  }

  /**
   * Send an object over the socket using EJSON serialization. Emits a copy
   * of the outgoing object as 'message:out'.
   */
  public send(object: unknown): void {
    if (!this.closing) {
      const message: string = EJSON.stringify(object);
      // Keep original behavior: assume rawSocket exists when send is called.
      this.rawSocket!.send(message);
      // Emit a copy of the object, as the listener might mutate it.
      this.emit('message:out', EJSON.parse(message));
    }
  }

  /**
   * Open the underlying raw socket. No-op if already open.
   */
  public open(): void {
    /*
     * Makes `open` a no-op if there's already a `rawSocket`. This avoids
     * memory / socket leaks if `open` is called twice (e.g. by a user
     * calling `ddp.connect` twice) without properly disposing of the
     * socket connection. `rawSocket` gets automatically set to `null` only
     * when it goes into a closed or error state. This way `rawSocket` is
     * disposed of correctly: the socket connection is closed, and the
     * object can be garbage collected.
     */
    if (this.rawSocket) {
      return;
    }
    this.closing = false;
    this.rawSocket = new this.SocketConstructor(this.endpoint);

    /*
     *   Calls to `onopen` and `onclose` directly trigger the `open` and
     *   `close` events on the `Socket` instance.
     */
    this.rawSocket.onopen = () => this.emit('open');
    this.rawSocket.onclose = () => {
      this.rawSocket = null;
      this.emit('close');
      this.closing = false;
    };
    /*
     *   Calls to `onmessage` trigger a `message:in` event on the `Socket`
     *   instance only once the message (first parameter to `onmessage`) has
     *   been successfully parsed into a javascript object.
     */
    this.rawSocket.onmessage = (message: { data: string }) => {
      let object: unknown;
      try {
        object = EJSON.parse(message.data);
      } catch {
        // Simply ignore the malformed message and return
        return;
      }
      // Outside the try-catch block as it must only catch JSON parsing
      // errors, not errors that may occur inside a "message:in" event
      // handler
      this.emit('message:in', object);
    };
  }

  /**
   * Close the underlying socket if present.
   */
  public close(): void {
    /*
     *   Avoid throwing an error if `rawSocket === null`
     */
    if (this.rawSocket) {
      this.closing = true;
      this.rawSocket.close();
    }
  }
}
