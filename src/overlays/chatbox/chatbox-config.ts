import { fontSettings, shadowSettings, sizeSettings } from "../../shared/appearance.ts";
import type { ConfigSource } from "../../shared/config.ts";
import type { ThirdPartyEmoteProviderName } from "../../shared/emotes/emote.ts";
import type { ThirdPartyBadgeProviderName } from "../../shared/twitch/third-party-badges.ts";
import {
  booleanSetting,
  choiceSetting,
  colorSetting,
  multiChoiceSetting,
  numberSetting,
  readSettings,
  textSetting,
  type SettingsSchema,
  type SettingsValues,
} from "../../shared/settings.ts";

// Constants
export const chatboxOverlayId = "chatbox";
export const missingChannelMessage = "No valid channel configured. Open the settings from the tray icon and enter your channel.";

// Schema
export const chatboxSettings = {
  channel: textSetting({ label: "Twitch channel", group: "Channel", default: "", placeholder: "yourchannel", live: false }),

  maxMessages: numberSetting({ label: "Maximum messages", group: "Messages", default: 30, min: 1, max: 200 }),
  hideAfterSeconds: numberSetting({
    label: "Hide messages after",
    group: "Messages",
    hint: "0 keeps messages until they are pushed out by newer ones.",
    default: 0,
    min: 0,
    max: 600,
    unit: "s",
  }),
  animation: choiceSetting({
    label: "Animation for new messages",
    group: "Messages",
    default: "fade",
    options: [
      { value: "none", label: "None" },
      { value: "fade", label: "Fade in" },
      { value: "slide", label: "Slide in" },
    ],
  }),
  alignment: choiceSetting({
    label: "Position of messages",
    group: "Messages",
    default: "bottom",
    options: [
      { value: "bottom", label: "Bottom" },
      { value: "top", label: "Top" },
    ],
  }),

  ...fontSettings(undefined, 18, "600"),
  ...shadowSettings(undefined),
  messageBackground: colorSetting({ label: "Message background", group: "Appearance", default: "#00000000" }),
  messageSpacing: numberSetting({ label: "Space between messages", group: "Appearance", default: 4, min: 0, max: 32, unit: "px" }),
  emoteSize: numberSetting({ label: "Emote size", group: "Appearance", default: 175, min: 100, max: 400, step: 5, unit: "%" }),

  showBadges: booleanSetting({ label: "Show badges", group: "Twitch", default: true }),
  thirdPartyBadges: multiChoiceSetting<ThirdPartyBadgeProviderName>({
    label: "Third-party badges",
    group: "Twitch",
    hint: "Badges from other chat tools, shown after the Twitch badges. 7TV badges are looked up per user and appear a moment after the first message.",
    default: [],
    live: false,
    options: [
      { value: "7tv", label: "7TV" },
      { value: "bttv", label: "BetterTTV" },
      { value: "ffz", label: "FrankerFaceZ" },
      { value: "chatterino", label: "Chatterino" },
    ],
  }),
  readableColors: booleanSetting({
    label: "Readable name colors",
    group: "Twitch",
    hint: "Lightens dark name colors like Twitch's dark chat.",
    default: true,
  }),
  emoteProviders: multiChoiceSetting<ThirdPartyEmoteProviderName>({
    label: "Third-party emotes",
    group: "Twitch",
    default: ["7tv", "bttv", "ffz"],
    live: false,
    options: [
      { value: "7tv", label: "7TV" },
      { value: "bttv", label: "BetterTTV" },
      { value: "ffz", label: "FrankerFaceZ" },
    ],
  }),

  showSharedChatIcons: booleanSetting({
    label: "Show streamer icons",
    group: "Shared chat",
    hint: "During a shared chat, each message shows the profile picture of the channel it comes from. Needs the Twitch login.",
    default: true,
  }),
  showPartnerMessages: booleanSetting({
    label: "Show messages from partner channels",
    group: "Shared chat",
    default: true,
  }),

  ...sizeSettings(undefined, 400, 600),
} satisfies SettingsSchema;

// Types
export type ChatboxConfig = SettingsValues<typeof chatboxSettings>;

// Reading
export function readChatboxConfig(source: ConfigSource): ChatboxConfig {
  return readSettings(chatboxSettings, source);
}
