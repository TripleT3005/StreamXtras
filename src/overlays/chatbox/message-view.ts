import type { Emote } from "../../shared/emotes/emote.ts";
import type { MessageFragment } from "../../shared/emotes/fragments.ts";
import type { ChatMessageEvent } from "../../shared/events.ts";
import { getGlobalBadgeUrl } from "../../shared/twitch/badges.ts";

// Types
export interface MessageViewOptions {
  readonly showBadges: boolean;
}

// Rendering
export function renderMessage(message: ChatMessageEvent, fragments: readonly MessageFragment[], options: MessageViewOptions): HTMLElement {
  const item = document.createElement("li");
  item.className = message.isAction ? "message action" : "message";
  item.dataset["messageId"] = message.id;
  item.dataset["userId"] = message.user.id;

  if (options.showBadges) {
    const badges = renderBadges(message);
    if (badges !== null) {
      item.append(badges);
    }
  }

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = message.user.displayName;
  if (message.user.color !== null) {
    name.style.color = message.user.color;
  }

  const text = document.createElement("span");
  text.className = "text";
  text.append(...fragments.map(renderFragment));

  item.append(name, text);
  return item;
}

function renderBadges(message: ChatMessageEvent): HTMLElement | null {
  const images = message.user.badges.flatMap((badge) => {
    const url = getGlobalBadgeUrl(badge);
    return url === null ? [] : [createImage("badge", url, badge.set)];
  });
  if (images.length === 0) {
    return null;
  }
  const container = document.createElement("span");
  container.className = "badges";
  container.append(...images);
  return container;
}

function renderFragment(fragment: MessageFragment): Node {
  if (fragment.kind === "text") {
    return document.createTextNode(fragment.text);
  }
  if (fragment.overlays.length === 0) {
    return createEmoteImage(fragment.emote);
  }
  const stack = document.createElement("span");
  stack.className = "emote-stack";
  stack.append(createEmoteImage(fragment.emote), ...fragment.overlays.map(createEmoteImage));
  return stack;
}

function createEmoteImage(emote: Emote): HTMLImageElement {
  return createImage("emote", emote.url, emote.name);
}

function createImage(className: string, url: string, alt: string): HTMLImageElement {
  const image = document.createElement("img");
  image.className = className;
  image.src = url;
  image.alt = alt;
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  return image;
}
