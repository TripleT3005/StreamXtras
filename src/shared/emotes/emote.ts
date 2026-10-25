// Types
export type ThirdPartyEmoteProviderName = "7tv" | "bttv" | "ffz";

export type EmoteProviderName = "twitch" | ThirdPartyEmoteProviderName;

export interface Emote {
  readonly name: string;
  readonly provider: EmoteProviderName;
  readonly url: string;
  readonly zeroWidth: boolean;
}

export interface EmoteProvider {
  readonly name: ThirdPartyEmoteProviderName;
  loadGlobal(): Promise<readonly Emote[]>;
  loadChannel(channelId: string): Promise<readonly Emote[]>;
}

export interface EmoteLookup {
  get(name: string): Emote | undefined;
}

// Twitch
export function createTwitchEmote(id: string, name: string): Emote {
  return {
    name,
    provider: "twitch",
    url: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/2.0`,
    zeroWidth: false,
  };
}
