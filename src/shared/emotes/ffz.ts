import { fetchJson, toHttpsUrl } from "../http.ts";
import { asArray, asString, isRecord } from "../json.ts";
import type { Emote, EmoteProvider } from "./emote.ts";

// Constants
const apiBaseUrl = "https://api.frankerfacez.com/v1";
const preferredSizes = ["2", "1", "4"];

// Parsing
export function parseFfzGlobal(data: unknown): Emote[] {
  if (!isRecord(data)) {
    return [];
  }
  const setIds = asArray(data["default_sets"]).map(String);
  return parseFfzSets(data["sets"], setIds);
}

export function parseFfzRoom(data: unknown): Emote[] {
  if (!isRecord(data) || !isRecord(data["room"])) {
    return [];
  }
  const setId = data["room"]["set"];
  return typeof setId === "number" || typeof setId === "string" ? parseFfzSets(data["sets"], [String(setId)]) : [];
}

function parseFfzSets(sets: unknown, setIds: readonly string[]): Emote[] {
  if (!isRecord(sets)) {
    return [];
  }
  return setIds.flatMap((setId) => {
    const set = sets[setId];
    return isRecord(set) ? asArray(set["emoticons"]).flatMap(parseFfzEmote) : [];
  });
}

function parseFfzEmote(entry: unknown): Emote[] {
  if (!isRecord(entry) || entry["hidden"] === true || entry["modifier"] === true) {
    return [];
  }
  const name = asString(entry["name"]);
  const url = selectUrl(entry["animated"]) ?? selectUrl(entry["urls"]);
  return name === null || url === null ? [] : [{ name, provider: "ffz", url, zeroWidth: false }];
}

function selectUrl(urls: unknown): string | null {
  if (!isRecord(urls)) {
    return null;
  }
  for (const size of preferredSizes) {
    const url = asString(urls[size]);
    if (url !== null) {
      return toHttpsUrl(url);
    }
  }
  return null;
}

// Provider
export const ffzProvider: EmoteProvider = {
  name: "ffz",

  async loadGlobal(): Promise<readonly Emote[]> {
    return parseFfzGlobal(await fetchJson(`${apiBaseUrl}/set/global`));
  },

  async loadChannel(channelId: string): Promise<readonly Emote[]> {
    return parseFfzRoom(await fetchJson(`${apiBaseUrl}/room/id/${encodeURIComponent(channelId)}`));
  },
};
