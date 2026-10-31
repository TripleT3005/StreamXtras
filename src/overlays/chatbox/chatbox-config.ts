import { fontSettings, shadowSettings, sizeSettings } from "../../shared/appearance.ts";
import type { ConfigSource } from "../../shared/config.ts";
import { streamerOption } from "./chat-filter.ts";
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
  channel: textSetting({ label: "setting.channel", group: "group.channel", default: "", placeholder: "yourchannel", live: false }),

  maxMessages: numberSetting({ label: "chatbox.max_messages", group: "group.messages", default: 30, min: 1, max: 200 }),
  hideAfterSeconds: numberSetting({
    label: "chatbox.hide_after",
    group: "group.messages",
    hint: "chatbox.hide_after.hint",
    default: 0,
    min: 0,
    max: 600,
    unit: "unit.seconds",
  }),
  animation: choiceSetting({
    label: "chatbox.animation",
    group: "group.messages",
    default: "fade",
    options: [
      { value: "none", label: "chatbox.animation.none" },
      { value: "fade", label: "chatbox.animation.fade" },
      { value: "slide", label: "setting.animation.slide" },
    ],
  }),
  alignment: choiceSetting({
    label: "chatbox.alignment",
    group: "group.messages",
    default: "bottom",
    options: [
      { value: "bottom", label: "chatbox.alignment.bottom" },
      { value: "top", label: "chatbox.alignment.top" },
    ],
  }),

  ...fontSettings(undefined, 18, "600"),
  ...shadowSettings(undefined),
  messageBackground: colorSetting({ label: "chatbox.message_background", group: "group.appearance", default: "#00000000" }),
  messageSpacing: numberSetting({ label: "chatbox.message_spacing", group: "group.appearance", default: 4, min: 0, max: 32, unit: "px" }),
  emoteSize: numberSetting({ label: "setting.emote_size", group: "group.appearance", default: 175, min: 100, max: 400, step: 5, unit: "%" }),

  showBadges: booleanSetting({ label: "chatbox.show_badges", group: "group.twitch", default: true }),
  thirdPartyBadges: multiChoiceSetting<ThirdPartyBadgeProviderName>({
    label: "chatbox.third_party_badges",
    group: "group.twitch",
    hint: "chatbox.third_party_badges.hint",
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
    label: "chatbox.readable_colors",
    group: "group.twitch",
    hint: "chatbox.readable_colors.hint",
    default: true,
  }),
  emoteProviders: multiChoiceSetting<ThirdPartyEmoteProviderName>({
    label: "setting.third_party_emotes",
    group: "group.twitch",
    default: ["7tv", "bttv", "ffz"],
    live: false,
    options: [
      { value: "7tv", label: "7TV" },
      { value: "bttv", label: "BetterTTV" },
      { value: "ffz", label: "FrankerFaceZ" },
    ],
  }),

  hiddenBots: multiChoiceSetting({
    label: "chatbox.hidden_bots",
    group: "group.filters",
    default: [],
    options: [
      { value: streamerOption, label: "chatbox.hidden_bots.streamer" },
      { value: "nightbot", label: "Nightbot" },
      { value: "streamelements", label: "StreamElements" },
      { value: "streamlabs", label: "Streamlabs" },
      { value: "moobot", label: "Moobot" },
      { value: "fossabot", label: "Fossabot" },
      { value: "wizebot", label: "WizeBot" },
      { value: "sery_bot", label: "Sery_Bot" },
      { value: "soundalerts", label: "SoundAlerts" },
      { value: "kofistreambot", label: "KofiStreamBot" },
      { value: "streamstickers", label: "StreamStickers" },
    ],
  }),
  hiddenUsers: textSetting({
    label: "chatbox.hidden_users",
    group: "group.filters",
    hint: "chatbox.hidden_users.hint",
    default: "",
    placeholder: "mybot, anotherbot",
  }),
  blockedWords: textSetting({
    label: "chatbox.blocked_words",
    group: "group.filters",
    hint: "chatbox.blocked_words.hint",
    default: "",
    placeholder: "spoiler, spoil*",
  }),

  showSharedChatIcons: booleanSetting({
    label: "chatbox.shared_chat_icons",
    group: "group.shared_chat",
    hint: "chatbox.shared_chat_icons.hint",
    default: true,
  }),
  showPartnerMessages: booleanSetting({
    label: "chatbox.partner_messages",
    group: "group.shared_chat",
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
