import type { ChatBadge } from "../events.ts";
import { fetchJson } from "../http.ts";
import { isRecord } from "../json.ts";
import { getGlobalBadgeUrl } from "./badges.ts";

// Types
export interface ResolvedBadge {
  readonly url: string;
  readonly title: string;
}

export interface BadgeResolver {
  resolve(badge: ChatBadge, channelId: string | null): ResolvedBadge | null;
}

export type BadgeSets = ReadonlyMap<string, ReadonlyMap<string, ResolvedBadge>>;

type Loader = (url: string) => Promise<unknown>;

// Constants
const retryDelayMs = 5 * 60_000;

// Library
export class BadgeLibrary implements BadgeResolver {
  readonly #load: Loader;
  readonly #sets = new Map<string, BadgeSets>();
  readonly #requestedAt = new Map<string, number>();

  constructor(load: Loader = fetchJson) {
    this.#load = load;
  }

  loadGlobal(): Promise<void> {
    return this.#request("global", "/api/twitch/badges/global");
  }

  loadChannel(channelId: string): Promise<void> {
    return this.#request(channelId, `/api/twitch/badges/channel/${encodeURIComponent(channelId)}`);
  }

  resolve(badge: ChatBadge, channelId: string | null): ResolvedBadge | null {
    const channelSets = channelId === null ? undefined : this.#sets.get(channelId);
    return (
      channelSets?.get(badge.set)?.get(badge.version) ??
      this.#sets.get("global")?.get(badge.set)?.get(badge.version) ??
      builtInBadge(badge)
    );
  }

  async #request(key: string, url: string): Promise<void> {
    const requestedAt = this.#requestedAt.get(key);
    if (this.#sets.has(key) || (requestedAt !== undefined && Date.now() - requestedAt < retryDelayMs)) {
      return;
    }
    this.#requestedAt.set(key, Date.now());
    try {
      const sets = parseBadgeSets(await this.#load(url));
      if (sets !== null) {
        this.#sets.set(key, sets);
      }
    } catch {
      return;
    }
  }
}

// Parsing
export function parseBadgeSets(data: unknown): BadgeSets | null {
  if (!isRecord(data)) {
    return null;
  }
  const sets = new Map<string, ReadonlyMap<string, ResolvedBadge>>();
  for (const [setId, versions] of Object.entries(data)) {
    if (!isRecord(versions)) {
      continue;
    }
    const parsed = new Map<string, ResolvedBadge>();
    for (const [versionId, version] of Object.entries(versions)) {
      if (isRecord(version) && typeof version["url"] === "string" && version["url"].startsWith("https://")) {
        parsed.set(versionId, { url: version["url"], title: typeof version["title"] === "string" ? version["title"] : setId });
      }
    }
    sets.set(setId, parsed);
  }
  return sets;
}

function builtInBadge(badge: ChatBadge): ResolvedBadge | null {
  const url = getGlobalBadgeUrl(badge);
  return url === null ? null : { url, title: badge.set };
}
