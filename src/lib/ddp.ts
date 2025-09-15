/**
 * DDP.JS 2.1.0 - TypeScript (strict) conversion
 */

import EventEmitter from 'wolfy87-eventemitter';
import Queue from './queue';
import Socket from './socket';
import { uniqueId } from './utils';

/**
 * Types & Interfaces
 */

type ConnectionStatus = 'connected' | 'disconnected';

enum DDPVersion {
  V1 = '1',
}

type DDPPublicEvent = 'ready' | 'nosub' | 'added' | 'changed' | 'removed' | 'result' | 'updated' | 'error';

const PUBLIC_EVENTS: readonly DDPPublicEvent[] = [
  'ready',
  'nosub',
  'added',
  'changed',
  'removed',
  'result',
  'updated',
  'error',
];

/** Outgoing message shapes */
interface ConnectMessage {
  msg: 'connect';
  version: DDPVersion;
  support: DDPVersion[];
}
interface MethodMessage {
  msg: 'method';
  id: string;
  method: string;
  params?: unknown[];
}
interface SubMessage {
  msg: 'sub';
  id: string;
  name: string;
  params?: unknown[];
}
interface UnsubMessage {
  msg: 'unsub';
  id: string;
}
interface PongMessage {
  msg: 'pong';
  id?: string;
}

type DDPOutgoingMessage = ConnectMessage | MethodMessage | SubMessage | UnsubMessage | PongMessage | Record<string, unknown>;

/** Incoming message (loose shape to preserve behavior) */
interface DDPIncomingMessage {
  msg?: string;
  id?: string;
  [key: string]: unknown;
}

/** Options passed to DDP constructor */
interface DDPOptions {
  autoConnect?: boolean;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  SocketConstructor?: unknown;
  endpoint?: string;
}

/** Minimal Queue interface used by this module */
interface QueueGeneric<T> {
  push(item: T): void;
  process(): void;
  empty(): void;
}

/** Minimal Socket interface used by this module */
interface SocketInterface {
  on(event: 'open' | 'close' | 'message:in', cb: (message?: DDPIncomingMessage) => void): void;
  send(message: DDPOutgoingMessage | Record<string, unknown>): void;
  open(): void;
  close(): void;
}

/** Minimal EventEmitter base typing for runtime class from wolfy87-eventemitter */
interface EventEmitterBase {
  emit(eventName: string, ...args: unknown[]): void;
  on(eventName: string, listener: (...args: unknown[]) => void): void;
  off?(eventName: string, listener: (...args: unknown[]) => void): void;
}

/**
 * Adapt imported JS classes to typed constructors so we can use them with strict typing.
 * We don't modify their runtime behavior, only assert shapes for the compiler.
 */
const QueueCtor = Queue as unknown as new (handler: (message: DDPOutgoingMessage) => boolean) => QueueGeneric<DDPOutgoingMessage>;
const SocketCtor = Socket as unknown as new (socketConstructor?: unknown, endpoint?: string) => SocketInterface;
const EventEmitterCtor = EventEmitter as unknown as new () => EventEmitterBase;

const DEFAULT_RECONNECT_INTERVAL = 10000;

/**
 * DDP client class
 */
export default class DDP extends EventEmitterCtor {
  public status: ConnectionStatus = 'disconnected';
  public autoConnect: boolean;
  public autoReconnect: boolean;
  public reconnectInterval: number;
  private messageQueue: QueueGeneric<DDPOutgoingMessage>;
  private socket: SocketInterface;

  constructor(options: DDPOptions) {
    super();

    // Default `autoConnect` and `autoReconnect` to true
    this.autoConnect = options.autoConnect !== false;
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectInterval = options.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL;

    // Create a typed Queue instance. The runtime Queue implementation is JavaScript;
    // we assert its constructor signature for the compiler.
    this.messageQueue = new QueueCtor((message: DDPOutgoingMessage): boolean => {
      if (this.status === 'connected') {
        this.socket.send(message);
        return true;
      }
      return false;
    });

    // Create a typed Socket instance. We assert the runtime Socket shape.
    this.socket = new SocketCtor(options.SocketConstructor, options.endpoint);

    // When the socket opens, send the `connect` message to establish the DDP connection
    this.socket.on('open', (): void => {
      const connectMessage: ConnectMessage = {
        msg: 'connect',
        version: DDPVersion.V1,
        support: [DDPVersion.V1],
      };
      this.socket.send(connectMessage);
    });

    this.socket.on('close', (): void => {
      this.status = 'disconnected';
      this.messageQueue.empty();
      // emit asynchronously to preserve original behavior
      this.emit('disconnected');
      if (this.autoReconnect) {
        // Schedule a reconnection
        setTimeout(() => this.socket.open(), this.reconnectInterval);
      }
    });

    this.socket.on('message:in', (message?: DDPIncomingMessage): void => {
      const msgType = message?.msg;
      if (msgType === 'connected') {
        this.status = 'connected';
        this.messageQueue.process();
        this.emit('connected');
      } else if (msgType === 'ping') {
        // Reply with a `pong` message to prevent the server from closing the connection
        const pong: PongMessage = { msg: 'pong', id: message?.id };
        this.socket.send(pong);
      } else if (typeof msgType === 'string' && (PUBLIC_EVENTS as readonly string[]).includes(msgType)) {
        // Forward public events to listeners
        // typed as DDPPublicEvent but runtime check uses array membership
        this.emit(msgType, message);
      }
    });

    if (this.autoConnect) {
      this.connect();
    }
  }

  // Override emit to make events asynchronous (keeps original behavior)
  public emit(eventName: string, ...args: unknown[]): void {
    // Call super.emit asynchronously
    setTimeout(() => super.emit(eventName, ...args), 0);
  }

  public connect(): void {
    this.socket.open();
  }

  public disconnect(): void {
    /*
     *   If `disconnect` is called, the caller likely doesn't want the
     *   the instance to try to auto-reconnect. Therefore we set the
     *   `autoReconnect` flag to false.
     */
    this.autoReconnect = false;
    this.socket.close();
  }

  public method(name: string, params?: unknown[]): string {
    const id: string = uniqueId();
    const message: MethodMessage = {
      msg: 'method',
      id,
      method: name,
      params,
    };
    this.messageQueue.push(message);
    return id;
  }

  public sub(name: string, params?: unknown[]): string {
    const id: string = uniqueId();
    const message: SubMessage = {
      msg: 'sub',
      id,
      name,
      params,
    };
    this.messageQueue.push(message);
    return id;
  }

  public unsub(id: string): string {
    const message: UnsubMessage = {
      msg: 'unsub',
      id,
    };
    this.messageQueue.push(message);
    return id;
  }
}
