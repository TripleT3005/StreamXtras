import type { Emote } from "../../shared/emotes/emote.ts";
import type { MessageFragment } from "../../shared/emotes/fragments.ts";

// Types
export interface EmoteCount {
  readonly emote: Emote;
  readonly count: number;
}

interface EmoteUse {
  readonly time: number;
  readonly key: string;
}

// Constants
const maxUses = 50_000;

// Counter
export class EmoteCounter {
  #uses: EmoteUse[] = [];
  readonly #emotes = new Map<string, Emote>();

  get size(): number {
    return this.#uses.length;
  }

  add(fragments: readonly MessageFragment[], time: number): void {
    const keys = new Set<string>();
    for (const fragment of fragments) {
      if (fragment.kind === "emote") {
        const key = `${fragment.emote.provider}:${fragment.emote.name}`;
        this.#emotes.set(key, fragment.emote);
        keys.add(key);
      }
    }
    for (const key of keys) {
      this.#uses.push({ time, key });
    }
    if (this.#uses.length > maxUses) {
      this.#uses = this.#uses.slice(-maxUses);
    }
  }

  top(limit: number, windowMs: number, now: number): EmoteCount[] {
    if (windowMs > 0) {
      const oldest = now - windowMs;
      const firstKept = this.#uses.findIndex((use) => use.time >= oldest);
      this.#uses = firstKept < 0 ? [] : this.#uses.slice(firstKept);
    }
    const counts = new Map<string, { count: number; last: number }>();
    for (const use of this.#uses) {
      const entry = counts.get(use.key);
      counts.set(use.key, { count: (entry?.count ?? 0) + 1, last: use.time });
    }
    return [...counts]
      .sort(([, first], [, second]) => second.count - first.count || second.last - first.last)
      .slice(0, limit)
      .flatMap(([key, entry]) => {
        const emote = this.#emotes.get(key);
        return emote === undefined ? [] : [{ emote, count: entry.count }];
      });
  }
}
