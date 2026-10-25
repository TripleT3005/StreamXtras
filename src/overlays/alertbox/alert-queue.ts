// Constants
const maxQueuedAlerts = 50;

// Queue
export class AlertQueue<T> {
  readonly #show: (item: T) => Promise<void>;
  readonly #items: T[] = [];
  #isShowing = false;

  constructor(show: (item: T) => Promise<void>) {
    this.#show = show;
  }

  get length(): number {
    return this.#items.length;
  }

  enqueue(item: T): void {
    if (this.#items.length >= maxQueuedAlerts) {
      return;
    }
    this.#items.push(item);
    void this.#next();
  }

  async #next(): Promise<void> {
    if (this.#isShowing) {
      return;
    }
    const item = this.#items.shift();
    if (item === undefined) {
      return;
    }
    this.#isShowing = true;
    try {
      await this.#show(item);
    } catch (error: unknown) {
      console.error("Showing an alert failed", error);
    } finally {
      this.#isShowing = false;
    }
    await this.#next();
  }
}
