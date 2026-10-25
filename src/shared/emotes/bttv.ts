import { fetchJson } from "../http.ts";
import { asArray, asString, isRecord } from "../json.ts";
import type { Emote, EmoteProvider } from "./emote.ts";

// Constants
const apiBaseUrl = "https://api.betterttv.net/3/cached";
const zeroWidthCodes: ReadonlySet<string> = new Set(["SoSnowy", "IceCold", "SantaHat", "TopHat", "ReinDeer", "CandyCane", "cvMask", "cvHazmat"]);

// Parsing
export function parseBttvEmotes(data: unknown): Emote[] {
  return asArray(data).flatMap((entry): Emote[] => {
    if (!isRecord(entry) || entry["modifier"] === true) {
      return [];
    }
    const id = asString(entry["id"]);
    const name = asString(entry["code"]);
    if (id === null || name === null) {
      return [];
    }
    return [
      {
        name,
        provider: "bttv",
        url: `https://cdn.betterttv.net/emote/${encodeURIComponent(id)}/2x.webp`,
        zeroWidth: zeroWidthCodes.has(name),
      },
    ];
  });
}

export function parseBttvChannel(data: unknown): Emote[] {
  if (!isRecord(data)) {
    return [];
  }
  return [...parseBttvEmotes(data["channelEmotes"]), ...parseBttvEmotes(data["sharedEmotes"])];
}

// Provider
export const bttvProvider: EmoteProvider = {
  name: "bttv",

  async loadGlobal(): Promise<readonly Emote[]> {
    return parseBttvEmotes(await fetchJson(`${apiBaseUrl}/emotes/global`));
  },

  async loadChannel(channelId: string): Promise<readonly Emote[]> {
    return parseBttvChannel(await fetchJson(`${apiBaseUrl}/users/twitch/${encodeURIComponent(channelId)}`));
  },
};
