// Chat list
export class ChatList {
  readonly #container: HTMLElement;
  readonly #maxMessages: number;

  constructor(container: HTMLElement, maxMessages: number) {
    this.#container = container;
    this.#maxMessages = maxMessages;
  }

  add(item: HTMLElement): void {
    this.#container.append(item);
    this.#trim();
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

  #items(): HTMLElement[] {
    return [...this.#container.querySelectorAll<HTMLElement>(".message")];
  }

  #trim(): void {
    while (this.#container.childElementCount > this.#maxMessages) {
      this.#container.firstElementChild?.remove();
    }
  }
}
