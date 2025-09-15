export type Consumer<T> = (element: T) => boolean;

/**
 * As the name implies, `consumer` is the (sole) consumer of the queue.
 * It gets called with each element of the queue and its return value
 * serves as an ack, determining whether the element is removed or not from
 * the queue, allowing then subsequent elements to be processed.
 */
export default class Queue<T> {
  private consumer: Consumer<T>;
  private queue: T[] = [];

  constructor(consumer: Consumer<T>) {
    this.consumer = consumer;
  }

  push(element: T): void {
    this.queue.push(element);
    this.process();
  }

  process(): void {
    if (this.queue.length !== 0) {
      const ack: boolean = this.consumer(this.queue[0]);
      if (ack) {
        this.queue.shift();
        this.process();
      }
    }
  }

  empty(): void {
    this.queue = [];
  }
}
