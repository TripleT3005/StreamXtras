import { fetchJson } from "../http.ts";
import { isRecord } from "../json.ts";

// Types
export interface AvatarResolver {
  avatar(userId: string): Promise<string | null>;
}

type Loader = (url: string) => Promise<unknown>;

// Constants
const retryDelayMs = 5 * 60_000;

// Library
export class UserLibrary implements AvatarResolver {
  readonly #load: Loader;
  readonly #avatars = new Map<string, Promise<string | null>>();
  readonly #failedAt = new Map<string, number>();

  constructor(load: Loader = fetchJson) {
    this.#load = load;
  }

  avatar(userId: string): Promise<string | null> {
    const failedAt = this.#failedAt.get(userId);
    const cached = this.#avatars.get(userId);
    if (cached !== undefined && (failedAt === undefined || Date.now() - failedAt < retryDelayMs)) {
      return cached;
    }
    const request = this.#fetchAvatar(userId);
    this.#avatars.set(userId, request);
    return request;
  }

  async #fetchAvatar(userId: string): Promise<string | null> {
    try {
      const data = await this.#load(`/api/twitch/users/${encodeURIComponent(userId)}`);
      const url = isRecord(data) ? data["profileImageUrl"] : null;
      if (typeof url === "string" && url.startsWith("https://")) {
        this.#failedAt.delete(userId);
        return url;
      }
    } catch {
      this.#failedAt.set(userId, Date.now());
      return null;
    }
    this.#failedAt.set(userId, Date.now());
    return null;
  }
}
