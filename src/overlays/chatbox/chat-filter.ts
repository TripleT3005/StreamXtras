import type { ChatMessageEvent } from "../../shared/events.ts";

// Types
export interface ChatFilterOptions {
  readonly hiddenBots: readonly string[];
  readonly hiddenUsers: string;
  readonly blockedWords: string;
}

export type ChatFilter = (message: ChatMessageEvent) => boolean;

// Constants
export const streamerOption = "streamer";
const wordCharacter = "[\\p{L}\\p{N}_]";

// Filter
export function createChatFilter(options: ChatFilterOptions): ChatFilter {
  const hidesStreamer = options.hiddenBots.includes(streamerOption);
  const hiddenLogins = new Set([...options.hiddenBots.filter((bot) => bot !== streamerOption), ...splitList(options.hiddenUsers)].map(toLogin));
  const patterns = splitList(options.blockedWords).flatMap(toPattern);
  return (message) => {
    if (hidesStreamer && message.user.id === message.channelId) {
      return true;
    }
    if (hiddenLogins.has(message.user.login.toLowerCase())) {
      return true;
    }
    return patterns.some((pattern) => pattern.test(message.text));
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function toLogin(name: string): string {
  return name.replace(/^@/, "").toLowerCase();
}

function toPattern(entry: string): RegExp[] {
  const isPrefix = entry.endsWith("*");
  const word = (isPrefix ? entry.slice(0, -1) : entry).trim();
  if (word === "") {
    return [];
  }
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const end = isPrefix ? "" : `(?!${wordCharacter})`;
  return [new RegExp(`(?<!${wordCharacter})${escaped}${end}`, "iu")];
}
