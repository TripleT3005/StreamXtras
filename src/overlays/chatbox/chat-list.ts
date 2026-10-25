// Constants
const leaveDurationMs = 400;

// Chat list
export class ChatList {
  readonly #container: HTMLElement;
  #maxMessages: number;
  #hideAfterMs: number;

  constructor(container: HTMLElement, maxMessages: number, hideAfterSeconds: number) {
    this.#container = container;
    this.#maxMessages = maxMessages;
    this.#hideAfterMs = hideAfterSeconds * 1000;
  }

  configure(maxMessages: number, hideAfterSeconds: number): void {
    this.#maxMessages = maxMessages;
    this.#hideAfterMs = hideAfterSeconds * 1000;
    this.#trim();
  }

  add(item: HTMLElement): void {
    this.#container.append(item);
    this.#trim();
    if (this.#hideAfterMs > 0) {
      setTimeout(() => this.#leave(item), this.#hideAfterMs);
    }
  }

  remove(messageId: string): void {
    for (const item of this.#items()) {
      if (item.dataset["messageId"] === messageId) {
        item.remove();
      }
    }
  }

  clear(userId: string | null): void {
    if (userId === null) {
      this.#container.replaceChildren();
      return;
    }
    for (const item of this.#items()) {
      if (item.dataset["userId"] === userId) {
        item.remove();
      }
    }
  }

  #leave(item: HTMLElement): void {
    if (!item.isConnected) {
      return;
    }
    item.classList.add("leaving");
    setTimeout(() => item.remove(), leaveDurationMs);
  }

  #items(): HTMLElement[] {
    return [...this.#container.querySelectorAll<HTMLElement>(".message")];
  }

  #trim(): void {
    while (this.#container.childElementCount > this.#maxMessages) {
      this.#container.firstElementChild?.remove();
    }
  }
}
