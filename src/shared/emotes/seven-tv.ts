import { fetchJson, toHttpsUrl } from "../http.ts";
import { asArray, asNumber, asString, isRecord } from "../json.ts";
import type { Emote, EmoteProvider } from "./emote.ts";

// Constants
const apiBaseUrl = "https://7tv.io/v3";
const activeZeroWidthFlag = 1;
const emoteZeroWidthFlag = 1 << 8;
const preferredFiles = ["2x.webp", "1x.webp"];

// Parsing
export function parseSevenTvEmoteSet(data: unknown): Emote[] {
  const entries = isRecord(data) ? asArray(data["emotes"]) : [];
  return entries.flatMap((entry): Emote[] => {
    if (!isRecord(entry) || !isRecord(entry["data"])) {
      return [];
    }
    const emoteData = entry["data"];
    const name = asString(entry["name"]);
    const url = isRecord(emoteData["host"]) ? selectFileUrl(emoteData["host"]) : null;
    if (name === null || url === null) {
      return [];
    }
    const zeroWidth =
      (asNumber(entry["flags"], 0) & activeZeroWidthFlag) !== 0 || (asNumber(emoteData["flags"], 0) & emoteZeroWidthFlag) !== 0;
    return [{ name, provider: "7tv", url, zeroWidth }];
  });
}

function selectFileUrl(host: Record<string, unknown>): string | null {
  const baseUrl = asString(host["url"]);
  if (baseUrl === null) {
    return null;
  }
  const fileNames = asArray(host["files"]).flatMap((file) => (isRecord(file) ? [asString(file["name"])] : []));
  const fileName = preferredFiles.find((preferred) => fileNames.includes(preferred));
  return fileName === undefined ? null : `${toHttpsUrl(baseUrl)}/${fileName}`;
}

// Provider
export const sevenTvProvider: EmoteProvider = {
  name: "7tv",

  async loadGlobal(): Promise<readonly Emote[]> {
    return parseSevenTvEmoteSet(await fetchJson(`${apiBaseUrl}/emote-sets/global`));
  },

  async loadChannel(channelId: string): Promise<readonly Emote[]> {
    const data = await fetchJson(`${apiBaseUrl}/users/twitch/${encodeURIComponent(channelId)}`);
    return parseSevenTvEmoteSet(isRecord(data) ? data["emote_set"] : null);
  },
};
