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
  channel: textSetting({ label: "setting.channel", group: "group.channel", default: "", placeholder: "yourchannel", live: false }),
  count: numberSetting({ label: "topemotes.count", group: "group.emotes", default: 5, min: 1, max: 10 }),
  windowMinutes: numberSetting({
    label: "topemotes.window",
    group: "group.emotes",
    hint: "topemotes.window.hint",
    default: 60,
    min: 0,
    max: 1440,
    step: 5,
    unit: "unit.minutes",
  }),
  emoteProviders: multiChoiceSetting<ThirdPartyEmoteProviderName>({
    label: "setting.third_party_emotes",
    group: "group.emotes",
    default: ["7tv", "bttv", "ffz"],
    live: false,
    options: [
      { value: "7tv", label: "7TV" },
      { value: "bttv", label: "BetterTTV" },
      { value: "ffz", label: "FrankerFaceZ" },
    ],
  }),
  title: textSetting({ label: "setting.title", group: "group.layout", hint: "setting.title.hint", default: "Top emotes" }),
  layout: choiceSetting({
    label: "setting.layout",
    group: "group.layout",
    default: "row",
    options: [
      { value: "row", label: "topemotes.layout.row" },
      { value: "column", label: "topemotes.layout.column" },
    ],
  }),
  emoteSize: numberSetting({ label: "setting.emote_size", group: "group.layout", default: 48, min: 16, max: 256, unit: "px" }),
  showCounts: booleanSetting({ label: "topemotes.show_counts", group: "group.layout", default: true }),
  ...appearanceSettings(undefined, 22),
  ...sizeSettings(undefined, 500, 200),
} satisfies SettingsSchema;

export type TopEmotesConfig = SettingsValues<typeof topEmotesSettings>;

// Reading
export function readTopEmotesConfig(source: ConfigSource): TopEmotesConfig {
  return readSettings(topEmotesSettings, source);
}
