import type { AnnouncementColor, ChatBadge, EmotePlacement, OverlayEvent } from "../events.ts";
import { getNick, type IrcMessage } from "./irc-message.ts";

// Constants
const actionPrefix = "\u0001ACTION ";
const actionSuffix = "\u0001";
const announcementColors: readonly AnnouncementColor[] = ["primary", "blue", "green", "orange", "purple"];

// Mapping
export function mapChatEvent(message: IrcMessage, now: number = Date.now()): OverlayEvent | null {
  switch (message.command) {
    case "PRIVMSG":
      return mapChatMessage(message, getNick(message.prefix), null, now);
    case "USERNOTICE":
      return mapUserNotice(message, now);
    case "CLEARMSG":
      return mapClearMessage(message);
    case "CLEARCHAT":
      return mapClearChat(message);
    case "ROOMSTATE":
      return mapRoomState(message);
    default:
      return null;
  }
}

function mapUserNotice(message: IrcMessage, now: number): OverlayEvent | null {
  const noticeType = message.tags.get("msg-id");
  const sourceNoticeType = noticeType === "sharedchatnotice" ? message.tags.get("source-msg-id") : noticeType;
  if (sourceNoticeType !== "announcement") {
    return null;
  }
  const color = (message.tags.get("msg-param-color") ?? "").toLowerCase();
  const announcement = announcementColors.find((candidate) => candidate === color) ?? "primary";
  return mapChatMessage(message, message.tags.get("login") ?? null, announcement, now);
}

function mapChatMessage(message: IrcMessage, login: string | null, announcement: AnnouncementColor | null, now: number): OverlayEvent | null {
  const { tags } = message;
  const id = tags.get("id");
  const userId = tags.get("user-id");
  const rawText = message.params[1];
  if (id === undefined || userId === undefined || login === null || login === "" || rawText === undefined) {
    return null;
  }

  const isAction = rawText.startsWith(actionPrefix) && rawText.endsWith(actionSuffix);
  const text = isAction ? rawText.slice(actionPrefix.length, -actionSuffix.length) : rawText;
  const sentAt = Number(tags.get("tmi-sent-ts"));

  return {
    type: "chat.message",
    platform: "twitch",
    id,
    channelId: tags.get("room-id") ?? "",
    sourceChannelId: tags.get("source-room-id") || null,
    user: {
      id: userId,
      login,
      displayName: tags.get("display-name") || login,
      color: tags.get("color") || null,
      badges: parseBadges(tags.get("source-badges") ?? tags.get("badges") ?? ""),
    },
    text,
    isAction,
    announcement,
    emotes: parseEmotes(tags.get("emotes") ?? ""),
    timestamp: Number.isFinite(sentAt) && sentAt > 0 ? sentAt : now,
  };
}

function mapClearMessage(message: IrcMessage): OverlayEvent | null {
  const messageId = message.tags.get("target-msg-id");
  return messageId === undefined ? null : { type: "chat.delete", platform: "twitch", messageId };
}

function mapClearChat(message: IrcMessage): OverlayEvent {
  return { type: "chat.clear", platform: "twitch", userId: message.tags.get("target-user-id") ?? null };
}

function mapRoomState(message: IrcMessage): OverlayEvent | null {
  const channelId = message.tags.get("room-id");
  const channel = message.params[0];
  if (channelId === undefined || channel === undefined) {
    return null;
  }
  return { type: "channel.joined", platform: "twitch", channelId, channelLogin: channel.replace(/^#/, "") };
}

// Tag parsing
export function parseBadges(value: string): ChatBadge[] {
  if (value === "") {
    return [];
  }
  return value.split(",").flatMap((badge) => {
    const [set, version] = badge.split("/");
    return set !== undefined && set !== "" && version !== undefined ? [{ set, version }] : [];
  });
}

export function parseEmotes(value: string): EmotePlacement[] {
  if (value === "") {
    return [];
  }
  const placements: EmotePlacement[] = [];
  for (const emote of value.split("/")) {
    const [id, ranges] = emote.split(":");
    if (id === undefined || id === "" || ranges === undefined) {
      continue;
    }
    for (const range of ranges.split(",")) {
      const [start, end] = range.split("-").map(Number);
      if (start !== undefined && end !== undefined && Number.isInteger(start) && Number.isInteger(end) && start <= end) {
        placements.push({ id, start, end });
      }
    }
  }
  return placements.sort((first, second) => first.start - second.start);
}
