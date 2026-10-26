import { appearanceSettings, sizeSettings } from "../../shared/appearance.ts";
import type { ConfigSource } from "../../shared/config.ts";
import {
  booleanSetting,
  choiceSetting,
  listSetting,
  mediaSetting,
  multiChoiceSetting,
  numberSetting,
  prefixed,
  readSettings,
  textSetting,
  type SettingOption,
  type SettingsSchema,
  type SettingsValues,
} from "../../shared/settings.ts";
import { plainAlertText, subTiers, tierLabel, type AlertType, type OverlayAlert, type SubTier } from "../../shared/alerts.ts";

// Types
interface AlertTypeDefinition {
  readonly label: string;
  readonly text: string;
  readonly amount: string | null;
  readonly tiers: boolean;
  readonly message: boolean;
  readonly match: VariantMatch;
  readonly image: string;
  readonly sound: string;
  readonly avatar: boolean;
}

export type VariantMatch = "exact" | "min" | "tier" | "user";

export type SpeechMode = "off" | "text" | "message" | "both";

// Constants
export const alertboxOverlayId = "alertbox";
export const generalSection = "General";
const speechGroup = "Text-to-speech";
const maxVariants = 20;

const soundBuiltIns: readonly SettingOption<string>[] = [
  { value: "assets/sounds/chime.wav", label: "Chime" },
  { value: "assets/sounds/pop.wav", label: "Pop" },
  { value: "assets/sounds/bell.wav", label: "Bell" },
  { value: "assets/sounds/coin.wav", label: "Coin" },
  { value: "assets/sounds/level-up.wav", label: "Level up" },
  { value: "assets/sounds/fanfare.wav", label: "Fanfare" },
  { value: "assets/sounds/sparkle.wav", label: "Sparkle" },
  { value: "assets/sounds/whoosh.wav", label: "Whoosh" },
  { value: "assets/sounds/bubble.wav", label: "Bubble" },
  { value: "assets/sounds/drum-hit.wav", label: "Drum hit" },
];

const imageBuiltIns: readonly SettingOption<string>[] = [
  { value: "assets/images/heart.svg", label: "Heart" },
  { value: "assets/images/star.svg", label: "Star" },
  { value: "assets/images/sparkles.svg", label: "Sparkles" },
  { value: "assets/images/x.svg", label: "StreamXtras X" },
  { value: "assets/images/crown.svg", label: "Crown" },
  { value: "assets/images/gift.svg", label: "Gift" },
  { value: "assets/images/explosion.svg", label: "Explosion" },
  { value: "assets/images/rocket.svg", label: "Rocket" },
  { value: "assets/images/trophy.svg", label: "Trophy" },
  { value: "assets/images/confetti.svg", label: "Confetti" },
];


export const alertTypeDefinitions: Readonly<Record<AlertType, AlertTypeDefinition>> = {
  follow: {
    label: "Follow",
    text: "{name} is now following!",
    amount: null,
    tiers: false,
    message: false,
    match: "user",
    image: "assets/images/heart.svg",
    sound: "assets/sounds/chime.wav",
    avatar: false,
  },
  sub: {
    label: "Subscription",
    text: "{name} just subscribed!",
    amount: "months",
    tiers: true,
    message: true,
    match: "min",
    image: "assets/images/crown.svg",
    sound: "assets/sounds/level-up.wav",
    avatar: false,
  },
  gift: {
    label: "Gift subs",
    text: "{name} gifted {amount} subs!",
    amount: "gifted subs",
    tiers: true,
    message: false,
    match: "min",
    image: "assets/images/gift.svg",
    sound: "assets/sounds/sparkle.wav",
    avatar: false,
  },
  cheer: {
    label: "Cheer",
    text: "{name} cheered {amount} bits!",
    amount: "bits",
    tiers: false,
    message: true,
    match: "min",
    image: "assets/images/explosion.svg",
    sound: "assets/sounds/coin.wav",
    avatar: false,
  },
  raid: {
    label: "Raid",
    text: "{name} is raiding with {amount} viewers!",
    amount: "viewers",
    tiers: false,
    message: false,
    match: "user",
    image: "assets/images/rocket.svg",
    sound: "assets/sounds/fanfare.wav",
    avatar: true,
  },
};

// Schema
function presentationSettings(definition: AlertTypeDefinition, group: string, section?: string) {
  const hints = [
    "{name} is replaced with the name.",
    definition.amount === null ? "" : `{amount} with the number of ${definition.amount}.`,
    definition.tiers ? "{tier} with Prime or Tier 1 to 3." : "",
    definition.message ? "{message} with the message of the viewer." : "",
  ];
  return {
    text: textSetting({
      label: "Text",
      group,
      section,
      hint: hints.filter((hint) => hint !== "").join(" "),
      default: definition.text,
      placeholder: definition.text,
    }),
    image: mediaSetting({
      label: "Image or video",
      group,
      section,
      hint: "Videos play to the end, with their own sound.",
      accepts: ["image", "video"],
      builtIns: imageBuiltIns,
      default: definition.image,
    }),
    avatar: booleanSetting({ label: "Show the profile picture instead", group, section, default: definition.avatar }),
    sound: mediaSetting({ label: "Sound", group, section, accepts: ["sound"], builtIns: soundBuiltIns, default: definition.sound }),
    duration: numberSetting({ label: "Duration", group, section, default: 6, min: 2, max: 30, unit: "s" }),
  };
}

function variantSettings(definition: AlertTypeDefinition) {
  const amountOptions: readonly SettingOption<VariantMatch>[] =
    definition.amount === null
      ? []
      : [
          { value: "exact", label: `Exactly this number of ${definition.amount}` },
          { value: "min", label: `At least this number of ${definition.amount}` },
        ];
  const tierOptions: readonly SettingOption<VariantMatch>[] = definition.tiers ? [{ value: "tier", label: "With this tier (Prime, 1, 2 or 3)" }] : [];
  const valueLabel = [definition.amount === null ? "" : "Number", definition.tiers ? "tier" : "", "Twitch name"].filter((part) => part !== "").join(", ");
  return {
    match: choiceSetting<VariantMatch>({
      label: "When",
      group: "",
      default: definition.match,
      options: [...amountOptions, ...tierOptions, { value: "user", label: "From this Twitch user" }],
    }),
    value: textSetting({ label: valueLabel.replace(/, (?=[^,]*$)/, " or "), group: "", default: "" }),
    ...presentationSettings(definition, ""),
  };
}

function speechModeOptions(definition: AlertTypeDefinition): readonly SettingOption<SpeechMode>[] {
  return [
    { value: "off", label: "Off" },
    { value: "text", label: "Read the alert text" },
    ...(definition.message
      ? ([
          { value: "message", label: "Read the message of the viewer" },
          { value: "both", label: "Read the alert text and the message" },
        ] as const)
      : []),
  ];
}

function alertTypeSettings<T extends AlertType>(type: T) {
  const definition = alertTypeDefinitions[type];
  const section = definition.label;
  return prefixed(type, {
    enabled: booleanSetting({ label: `${definition.label} alerts`, group: section, section, default: true, sectionToggle: true }),
    ...presentationSettings(definition, section, section),
    tts: choiceSetting<SpeechMode>({ label: "Read aloud", group: speechGroup, section, default: "off", options: speechModeOptions(definition) }),
    variants: listSetting({
      label: "Variants",
      group: "Variants",
      section,
      hint: "A variant replaces the settings above when it matches. The first matching variant wins.",
      itemSchema: variantSettings(definition),
      itemLabel: "Variant",
      maxItems: maxVariants,
      default: [],
    }),
  });
}

export const alertboxSettings = {
  volume: numberSetting({ label: "Volume", group: "Sound", section: generalSection, default: 70, min: 0, max: 100, unit: "%" }),

  layout: choiceSetting({
    label: "Layout",
    group: "Appearance",
    section: generalSection,
    default: "stacked",
    options: [
      { value: "stacked", label: "Image above text" },
      { value: "side", label: "Image next to text" },
    ],
  }),
  animation: choiceSetting({
    label: "Animation",
    group: "Appearance",
    section: generalSection,
    default: "pop",
    options: [
      { value: "pop", label: "Pop" },
      { value: "fade", label: "Fade" },
      { value: "slide", label: "Slide in" },
    ],
  }),
  imageSize: numberSetting({ label: "Image size", group: "Appearance", section: generalSection, default: 160, min: 40, max: 600, step: 10, unit: "px" }),
  videoWidth: numberSetting({ label: "Video width", group: "Appearance", section: generalSection, default: 480, min: 100, max: 1920, step: 10, unit: "px" }),
  ...appearanceSettings(generalSection, 36),

  ttsVoice: textSetting({
    label: "Voice",
    group: speechGroup,
    section: generalSection,
    hint: "Leave empty for the default voice of the computer running the companion app. Turn reading aloud on per alert type.",
    default: "",
    placeholder: "Default voice",
    suggestionsUrl: "/api/tts/voices",
  }),
  ttsVolume: numberSetting({ label: "Voice volume", group: speechGroup, section: generalSection, default: 80, min: 0, max: 100, unit: "%" }),
  ttsMaxLength: numberSetting({ label: "Maximum length", group: speechGroup, section: generalSection, default: 200, min: 20, max: 500, step: 10, unit: "chars" }),

  ...sizeSettings(generalSection, 600, 400),

  ...alertTypeSettings("follow"),
  ...alertTypeSettings("sub"),
  ...alertTypeSettings("gift"),
  ...alertTypeSettings("cheer"),
  ...alertTypeSettings("raid"),

  subTtsTiers: multiChoiceSetting<SubTier>({
    label: "Read aloud for",
    group: speechGroup,
    section: alertTypeDefinitions.sub.label,
    default: subTiers,
    options: subTiers.map((tier) => ({ value: tier, label: tierLabel(tier) })),
  }),
  giftTtsMin: numberSetting({ label: "Read aloud from", group: speechGroup, section: alertTypeDefinitions.gift.label, default: 5, min: 1, max: 1000, unit: "subs" }),
  cheerTtsMin: numberSetting({ label: "Read aloud from", group: speechGroup, section: alertTypeDefinitions.cheer.label, default: 100, min: 1, max: 1000000, unit: "bits" }),
} satisfies SettingsSchema;

// Types
export type AlertboxConfig = SettingsValues<typeof alertboxSettings>;

export type AlertVariant = AlertboxConfig["followVariants"][number];

export interface AlertStyle {
  readonly enabled: boolean;
  readonly text: string;
  readonly image: string;
  readonly avatar: boolean;
  readonly sound: string;
  readonly durationMs: number;
}

type AlertFacts = Pick<OverlayAlert, "type" | "userName" | "userLogin" | "amount" | "tier">;

// Reading
export function readAlertboxConfig(source: ConfigSource): AlertboxConfig {
  return readSettings(alertboxSettings, source);
}

export function alertTypeForSection(section: string | null): AlertType {
  const entry = Object.entries(alertTypeDefinitions).find(([, definition]) => definition.label === section);
  return (entry?.[0] as AlertType | undefined) ?? "follow";
}

export function alertStyle(config: AlertboxConfig, alert: AlertFacts): AlertStyle {
  const { type } = alert;
  const variant = config[`${type}Variants`].find((candidate) => variantMatches(candidate, alert));
  const chosen =
    variant === undefined
      ? {
          text: config[`${type}Text`],
          image: config[`${type}Image`],
          avatar: config[`${type}Avatar`],
          sound: config[`${type}Sound`],
          duration: config[`${type}Duration`],
        }
      : variant;
  return {
    enabled: config[`${type}Enabled`],
    text: chosen.text,
    image: chosen.image,
    avatar: chosen.avatar,
    sound: chosen.sound,
    durationMs: chosen.duration * 1000,
  };
}

export function alertSpeech(config: AlertboxConfig, alert: OverlayAlert, template: string): string {
  const mode = config[`${alert.type}Tts`];
  if (mode === "off" || !meetsSpeechThreshold(config, alert)) {
    return "";
  }
  const text = mode === "text" || mode === "both" ? plainAlertText(template, alert) : "";
  const readsMessage = mode === "message" || (mode === "both" && !template.includes("{message}"));
  const message = readsMessage ? alert.message : "";
  const separator = text === "" || message === "" ? "" : /[.!?]$/.test(text) ? " " : ". ";
  return `${text}${separator}${message}`.slice(0, config.ttsMaxLength);
}

function meetsSpeechThreshold(config: AlertboxConfig, alert: OverlayAlert): boolean {
  switch (alert.type) {
    case "sub":
      return alert.tier === null || config.subTtsTiers.includes(alert.tier);
    case "gift":
      return alert.amount >= config.giftTtsMin;
    case "cheer":
      return alert.amount >= config.cheerTtsMin;
    default:
      return true;
  }
}

export function variantMatches(variant: Pick<AlertVariant, "match" | "value">, alert: Omit<AlertFacts, "type">): boolean {
  const value = variant.value.trim();
  if (variant.match === "tier") {
    const tier = value.toLowerCase().replace(/^tier\s*/, "");
    return tier !== "" && alert.tier === tier;
  }
  if (variant.match === "user") {
    const name = value.replace(/^@/, "").toLowerCase();
    return name !== "" && (alert.userLogin.toLowerCase() === name || alert.userName.toLowerCase() === name);
  }
  if (!/^\d+$/.test(value)) {
    return false;
  }
  return variant.match === "exact" ? alert.amount === Number(value) : alert.amount >= Number(value);
}
