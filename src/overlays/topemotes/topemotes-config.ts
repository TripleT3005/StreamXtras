import { appearanceSettings, sizeSettings } from "../../shared/appearance.ts";
import type { ConfigSource } from "../../shared/config.ts";
import type { ThirdPartyEmoteProviderName } from "../../shared/emotes/emote.ts";
import {
  booleanSetting,
  choiceSetting,
  multiChoiceSetting,
  numberSetting,
  readSettings,
  textSetting,
  type SettingsSchema,
  type SettingsValues,
} from "../../shared/settings.ts";

// Constants
export const topEmotesOverlayId = "topemotes";

// Schema
export const topEmotesSettings = {
  channel: textSetting({ label: "Twitch channel", group: "Channel", default: "", placeholder: "yourchannel", live: false }),
  count: numberSetting({ label: "Number of emotes", group: "Emotes", default: 5, min: 1, max: 10 }),
  windowMinutes: numberSetting({
    label: "Count the last",
    group: "Emotes",
    hint: "0 counts everything since the browser source was loaded. Every emote counts once per message.",
    default: 60,
    min: 0,
    max: 1440,
    step: 5,
    unit: "min",
  }),
  emoteProviders: multiChoiceSetting<ThirdPartyEmoteProviderName>({
    label: "Third-party emotes",
    group: "Emotes",
    default: ["7tv", "bttv", "ffz"],
    live: false,
    options: [
      { value: "7tv", label: "7TV" },
      { value: "bttv", label: "BetterTTV" },
      { value: "ffz", label: "FrankerFaceZ" },
    ],
  }),
  title: textSetting({ label: "Title", group: "Layout", hint: "Leave empty to hide the title.", default: "Top emotes" }),
  layout: choiceSetting({
    label: "Layout",
    group: "Layout",
    default: "row",
    options: [
      { value: "row", label: "Side by side" },
      { value: "column", label: "Below each other" },
    ],
  }),
  emoteSize: numberSetting({ label: "Emote size", group: "Layout", default: 48, min: 16, max: 256, unit: "px" }),
  showCounts: booleanSetting({ label: "Show how often", group: "Layout", default: true }),
  ...appearanceSettings(undefined, 22),
  ...sizeSettings(undefined, 500, 200),
} satisfies SettingsSchema;

export type TopEmotesConfig = SettingsValues<typeof topEmotesSettings>;

// Reading
export function readTopEmotesConfig(source: ConfigSource): TopEmotesConfig {
  return readSettings(topEmotesSettings, source);
}
