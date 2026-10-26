// Constants
const maxQueuedAlerts = 50;

// Queue
export class AlertQueue<T> {
  readonly #show: (item: T, signal: AbortSignal) => Promise<void>;
  readonly #items: T[] = [];
  #isShowing = false;
  #isPaused = false;
  #current: AbortController | null = null;

  constructor(show: (item: T, signal: AbortSignal) => Promise<void>) {
    this.#show = show;
  }

  get length(): number {
    return this.#items.length;
  }

  get isPaused(): boolean {
    return this.#isPaused;
  }

  enqueue(item: T): void {
    if (this.#items.length >= maxQueuedAlerts) {
      return;
    }
    this.#items.push(item);
    void this.#next();
  }

  pause(): void {
    this.#isPaused = true;
  }

  resume(): void {
    this.#isPaused = false;
    void this.#next();
  }

  skip(): void {
    this.#current?.abort();
  }

  async #next(): Promise<void> {
    if (this.#isShowing || this.#isPaused) {
      return;
    }
    const item = this.#items.shift();
    if (item === undefined) {
      return;
    }
    this.#isShowing = true;
    this.#current = new AbortController();
    try {
      await this.#show(item, this.#current.signal);
    } catch (error: unknown) {
      console.error("Showing an alert failed", error);
    } finally {
      this.#isShowing = false;
      this.#current = null;
    }
    await this.#next();
  }
}
