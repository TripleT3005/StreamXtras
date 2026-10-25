import type { Emote } from "../../shared/emotes/emote.ts";
import type { MessageFragment } from "../../shared/emotes/fragments.ts";
import type { ChatMessageEvent } from "../../shared/events.ts";
import type { BadgeResolver } from "../../shared/twitch/badge-library.ts";
import type { AvatarResolver } from "../../shared/twitch/user-library.ts";
import { getDefaultUserColor, toReadableColor } from "../../shared/twitch/user-colors.ts";

// Types
export interface MessageViewOptions {
  readonly showBadges: boolean;
  readonly readableColors: boolean;
  readonly showSharedChatIcons: boolean;
}

export interface MessageContext {
  readonly badges: BadgeResolver;
  readonly avatars: AvatarResolver | null;
}

// Rendering
export function renderMessage(
  message: ChatMessageEvent,
  fragments: readonly MessageFragment[],
  options: MessageViewOptions,
  context: MessageContext,
): HTMLElement {
  const item = document.createElement("li");
  item.className = message.isAction ? "message action" : "message";
  if (message.announcement !== null) {
    item.classList.add("announcement", `announcement-${message.announcement}`);
  }
  item.dataset["messageId"] = message.id;
  item.dataset["userId"] = message.user.id;

  if (options.showSharedChatIcons && message.sourceChannelId !== null && context.avatars !== null) {
    item.append(renderSourceAvatar(message.sourceChannelId, context.avatars));
  }

  if (options.showBadges) {
    const badges = renderBadges(message, context.badges);
    if (badges !== null) {
      item.append(badges);
    }
  }

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = message.user.displayName;
  name.style.color = getNameColor(message, options);

  const text = document.createElement("span");
  text.className = "text";
  text.append(...fragments.map(renderFragment));

  item.append(name, text);
  return item;
}

function getNameColor(message: ChatMessageEvent, options: MessageViewOptions): string {
  const color = message.user.color ?? getDefaultUserColor(message.user.id);
  return options.readableColors ? toReadableColor(color) : color;
}

function renderSourceAvatar(channelId: string, avatars: AvatarResolver): HTMLImageElement {
  const image = document.createElement("img");
  image.className = "source-avatar";
  image.alt = "";
  image.hidden = true;
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  void avatars.avatar(channelId).then((url) => {
    if (url === null) {
      image.remove();
    } else {
      image.src = url;
      image.hidden = false;
    }
  });
  return image;
}

function renderBadges(message: ChatMessageEvent, resolver: BadgeResolver): HTMLElement | null {
  const channelId = message.sourceChannelId ?? message.channelId;
  const images = message.user.badges.flatMap((badge) => {
    const resolved = resolver.resolve(badge, channelId);
    return resolved === null ? [] : [createImage("badge", resolved.url, resolved.title)];
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
