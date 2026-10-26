import { fetchJson } from "../http.ts";
import { asArray, asString, isRecord } from "../json.ts";
import type { ResolvedBadge } from "./badge-library.ts";

// Types
export type ThirdPartyBadgeProviderName = "7tv" | "bttv" | "ffz" | "chatterino";

export type BadgeAssignments = ReadonlyMap<string, readonly ResolvedBadge[]>;

export interface ThirdPartyBadgeResolver {
  badgesFor(userId: string): readonly ResolvedBadge[];
}

type Loader = (url: string) => Promise<unknown>;

// Constants
const listUrls: Readonly<Record<Exclude<ThirdPartyBadgeProviderName, "7tv">, string>> = {
  bttv: "https://api.betterttv.net/3/cached/badges/twitch",
  ffz: "https://api.frankerfacez.com/v1/badges/ids",
  chatterino: "https://api.chatterino.com/badges",
};
const sevenTvUserUrl = "https://7tv.io/v3/users/twitch/";
const sevenTvBadgeUrl = "https://cdn.7tv.app/badge/";
const maxSevenTvUsers = 2000;

// Parsing
export function parseBttvBadges(data: unknown): BadgeAssignments {
  const assignments = new Map<string, ResolvedBadge[]>();
  for (const entry of asArray(data)) {
    if (!isRecord(entry) || !isRecord(entry["badge"])) {
      continue;
    }
    const userId = asString(entry["providerId"]);
    const url = httpsUrl(entry["badge"]["svg"]);
    if (userId !== null && url !== null) {
      add(assignments, userId, { url, title: asString(entry["badge"]["description"]) ?? "BetterTTV" });
    }
  }
  return assignments;
}

export function parseFfzBadges(data: unknown): BadgeAssignments {
  const assignments = new Map<string, ResolvedBadge[]>();
  if (!isRecord(data) || !isRecord(data["users"])) {
    return assignments;
  }
  const badges = new Map<string, ResolvedBadge>();
  for (const badge of asArray(data["badges"])) {
    if (!isRecord(badge) || !isRecord(badge["urls"])) {
      continue;
    }
    const url = httpsUrl(badge["urls"]["2"]) ?? httpsUrl(badge["urls"]["1"]);
    if (url !== null && (typeof badge["id"] === "number" || typeof badge["id"] === "string")) {
      badges.set(String(badge["id"]), { url, title: asString(badge["title"]) ?? "FrankerFaceZ" });
    }
  }
  for (const [badgeId, userIds] of Object.entries(data["users"])) {
    const badge = badges.get(badgeId);
    if (badge !== undefined) {
      for (const userId of asArray(userIds)) {
        add(assignments, String(userId), badge);
      }
    }
  }
  return assignments;
}

export function parseChatterinoBadges(data: unknown): BadgeAssignments {
  const assignments = new Map<string, ResolvedBadge[]>();
  for (const badge of isRecord(data) ? asArray(data["badges"]) : []) {
    if (!isRecord(badge)) {
      continue;
    }
    const url = httpsUrl(badge["image2"]) ?? httpsUrl(badge["image1"]);
    if (url === null) {
      continue;
    }
    const resolved = { url, title: asString(badge["tooltip"]) ?? "Chatterino" };
    for (const userId of asArray(badge["users"])) {
      add(assignments, String(userId), resolved);
    }
  }
  return assignments;
}

export function parseSevenTvUserBadge(data: unknown): ResolvedBadge | null {
  const user = isRecord(data) && isRecord(data["user"]) ? data["user"] : null;
  const badgeId = user !== null && isRecord(user["style"]) ? asString(user["style"]["badge_id"]) : null;
  if (badgeId === null || !/^[0-9A-Za-z]{20,32}$/.test(badgeId)) {
    return null;
  }
  return { url: `${sevenTvBadgeUrl}${badgeId}/2x.webp`, title: "7TV" };
}

function httpsUrl(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("https://") ? value : null;
}

function add(assignments: Map<string, ResolvedBadge[]>, userId: string, badge: ResolvedBadge): void {
  const badges = assignments.get(userId);
  if (badges === undefined) {
    assignments.set(userId, [badge]);
  } else {
    badges.push(badge);
  }
}

// Library
export class ThirdPartyBadgeLibrary implements ThirdPartyBadgeResolver {
  readonly #providers: readonly ThirdPartyBadgeProviderName[];
  readonly #load: Loader;
  readonly #lists = new Map<ThirdPartyBadgeProviderName, BadgeAssignments>();
  readonly #sevenTv = new Map<string, ResolvedBadge | null>();
  readonly #listeners = new Set<(userId: string) => void>();

  constructor(providers: readonly ThirdPartyBadgeProviderName[], load: Loader = fetchJson) {
    this.#providers = providers;
    this.#load = load;
  }

  async load(): Promise<void> {
    const parsers = { bttv: parseBttvBadges, ffz: parseFfzBadges, chatterino: parseChatterinoBadges } as const;
    await Promise.all(
      (["bttv", "ffz", "chatterino"] as const)
        .filter((provider) => this.#providers.includes(provider))
        .map(async (provider) => {
          try {
            this.#lists.set(provider, parsers[provider](await this.#load(listUrls[provider])));
          } catch (error: unknown) {
            console.warn(`Loading the ${provider} badges failed`, error);
          }
        }),
    );
  }

  onChange(listener: (userId: string) => void): void {
    this.#listeners.add(listener);
  }

  badgesFor(userId: string): readonly ResolvedBadge[] {
    const sevenTv = this.#providers.includes("7tv") ? this.#sevenTvBadge(userId) : null;
    const listed = [...this.#lists.values()].flatMap((assignments) => assignments.get(userId) ?? []);
    return sevenTv === null ? listed : [sevenTv, ...listed];
  }

  #sevenTvBadge(userId: string): ResolvedBadge | null {
    if (this.#sevenTv.has(userId)) {
      return this.#sevenTv.get(userId) ?? null;
    }
    if (this.#sevenTv.size >= maxSevenTvUsers) {
      this.#sevenTv.clear();
    }
    this.#sevenTv.set(userId, null);
    void this.#load(`${sevenTvUserUrl}${encodeURIComponent(userId)}`)
      .then((data) => {
        const badge = parseSevenTvUserBadge(data);
        if (badge !== null) {
          this.#sevenTv.set(userId, badge);
          for (const listener of this.#listeners) {
            listener(userId);
          }
        }
      })
      .catch(() => undefined);
    return null;
  }
}
