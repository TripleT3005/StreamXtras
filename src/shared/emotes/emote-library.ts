import type { Emote, EmoteLookup, EmoteProvider, ThirdPartyEmoteProviderName } from "./emote.ts";

// Constants
const providerPrecedence: readonly ThirdPartyEmoteProviderName[] = ["ffz", "bttv", "7tv"];

// Library
export class EmoteLibrary implements EmoteLookup {
  readonly #providers: readonly EmoteProvider[];
  readonly #globalEmotes = new Map<ThirdPartyEmoteProviderName, readonly Emote[]>();
  #channelId: string | null = null;
  #channelEmotes = new Map<ThirdPartyEmoteProviderName, readonly Emote[]>();
  #emotes: ReadonlyMap<string, Emote> = new Map();

  constructor(providers: readonly EmoteProvider[]) {
    this.#providers = [...providers].sort(
      (first, second) => providerPrecedence.indexOf(first.name) - providerPrecedence.indexOf(second.name),
    );
  }

  get size(): number {
    return this.#emotes.size;
  }

  get(name: string): Emote | undefined {
    return this.#emotes.get(name);
  }

  async load(channelId: string): Promise<void> {
    if (this.#channelId !== channelId) {
      this.#channelId = channelId;
      this.#channelEmotes = new Map();
    }
    await Promise.all(
      this.#providers.flatMap((provider) => [
        this.#globalEmotes.has(provider.name) ? Promise.resolve() : this.#loadInto(this.#globalEmotes, provider, () => provider.loadGlobal()),
        this.#loadInto(this.#channelEmotes, provider, () => provider.loadChannel(channelId)),
      ]),
    );
    this.#rebuild();
  }

  async #loadInto(
    target: Map<ThirdPartyEmoteProviderName, readonly Emote[]>,
    provider: EmoteProvider,
    load: () => Promise<readonly Emote[]>,
  ): Promise<void> {
    try {
      target.set(provider.name, await load());
    } catch (error: unknown) {
      console.warn(`Loading ${provider.name} emotes failed`, error);
    }
  }

  #rebuild(): void {
    const emotes = new Map<string, Emote>();
    for (const source of [this.#globalEmotes, this.#channelEmotes]) {
      for (const provider of this.#providers) {
        for (const emote of source.get(provider.name) ?? []) {
          emotes.set(emote.name, emote);
        }
      }
    }
    this.#emotes = emotes;
  }
}
