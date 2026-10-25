import type { ChatMessageEvent } from "../../shared/events.ts";

// Chat list
export class ChatList {
  readonly #container: HTMLElement;
  readonly #maxMessages: number;

  constructor(container: HTMLElement, maxMessages: number) {
    this.#container = container;
    this.#maxMessages = maxMessages;
  }

  add(message: ChatMessageEvent): void {
    const item = document.createElement("li");
    item.className = message.isAction ? "message action" : "message";
    item.dataset["messageId"] = message.id;
    item.dataset["userId"] = message.user.id;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = message.user.displayName;
    if (message.user.color !== null) {
      name.style.color = message.user.color;
    }

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = message.text;

    item.append(name, text);
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
