import { readBoolean, readInteger, readString, readStringList, type ConfigSource } from "../../shared/config.ts";
import type { ThirdPartyEmoteProviderName } from "../../shared/emotes/emote.ts";

// Types
export interface ChatboxConfig {
  readonly channel: string;
  readonly maxMessages: number;
  readonly showBadges: boolean;
  readonly readableColors: boolean;
  readonly emoteProviders: readonly ThirdPartyEmoteProviderName[];
}

// Constants
const allEmoteProviders: readonly ThirdPartyEmoteProviderName[] = ["7tv", "bttv", "ffz"];

// Reading
export function readChatboxConfig(source: ConfigSource): ChatboxConfig {
  return {
    channel: readString(source, "channel", ""),
    maxMessages: readInteger(source, "maxMessages", 30, 1, 200),
    showBadges: readBoolean(source, "showBadges", true),
    readableColors: readBoolean(source, "readableColors", true),
    emoteProviders: readStringList(source, "emoteProviders", allEmoteProviders)
      .map((name) => name.toLowerCase())
      .filter((name): name is ThirdPartyEmoteProviderName => allEmoteProviders.includes(name as ThirdPartyEmoteProviderName)),
  };
}
