import { appearanceSettings, sizeSettings } from "../../shared/appearance.ts";
import type { ConfigSource } from "../../shared/config.ts";
import {
  booleanSetting,
  generalSection,
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
  readonly section: string;
  readonly enabled: string;
  readonly text: string;
  readonly textHint: string;
  readonly counted: { readonly exact: string; readonly min: string; readonly amount: string } | null;
  readonly variantValue: string;
  readonly test: string;
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
const speechGroup = "group.speech";
const maxVariants = 20;

const soundBuiltIns: readonly SettingOption<string>[] = [
  { value: "assets/sounds/chime.wav", label: "sound.chime" },
  { value: "assets/sounds/pop.wav", label: "sound.pop" },
  { value: "assets/sounds/bell.wav", label: "sound.bell" },
  { value: "assets/sounds/coin.wav", label: "sound.coin" },
  { value: "assets/sounds/level-up.wav", label: "sound.level_up" },
  { value: "assets/sounds/fanfare.wav", label: "sound.fanfare" },
  { value: "assets/sounds/sparkle.wav", label: "sound.sparkle" },
  { value: "assets/sounds/whoosh.wav", label: "sound.whoosh" },
  { value: "assets/sounds/bubble.wav", label: "sound.bubble" },
  { value: "assets/sounds/drum-hit.wav", label: "sound.drum_hit" },
];

const imageBuiltIns: readonly SettingOption<string>[] = [
  { value: "assets/images/heart.svg", label: "image.heart" },
  { value: "assets/images/star.svg", label: "image.star" },
  { value: "assets/images/sparkles.svg", label: "image.sparkles" },
  { value: "assets/images/x.svg", label: "image.x" },
  { value: "assets/images/crown.svg", label: "image.crown" },
  { value: "assets/images/gift.svg", label: "image.gift" },
  { value: "assets/images/explosion.svg", label: "image.explosion" },
  { value: "assets/images/rocket.svg", label: "image.rocket" },
  { value: "assets/images/trophy.svg", label: "image.trophy" },
  { value: "assets/images/confetti.svg", label: "image.confetti" },
];

export const alertTypeDefinitions: Readonly<Record<AlertType, AlertTypeDefinition>> = {
  follow: {
    section: "alert.follow",
    enabled: "alert.follow.enabled",
    text: "{name} is now following!",
    textHint: "alert.follow.text_hint",
    counted: null,
    variantValue: "alert.follow.variant_value",
    test: "alert.follow.test",
    tiers: false,
    message: false,
    match: "user",
    image: "assets/images/heart.svg",
    sound: "assets/sounds/chime.wav",
    avatar: false,
  },
  sub: {
    section: "alert.sub",
    enabled: "alert.sub.enabled",
    text: "{name} just subscribed!",
    textHint: "alert.sub.text_hint",
    counted: { exact: "alert.sub.match_exact", min: "alert.sub.match_min", amount: "alert.sub.amount" },
    variantValue: "alert.sub.variant_value",
    test: "alert.sub.test",
    tiers: true,
    message: true,
    match: "min",
    image: "assets/images/crown.svg",
    sound: "assets/sounds/level-up.wav",
    avatar: false,
  },
  gift: {
    section: "alert.gift",
    enabled: "alert.gift.enabled",
    text: "{name} gifted {amount} subs!",
    textHint: "alert.gift.text_hint",
    counted: { exact: "alert.gift.match_exact", min: "alert.gift.match_min", amount: "alert.gift.amount" },
    variantValue: "alert.gift.variant_value",
    test: "alert.gift.test",
    tiers: true,
    message: false,
    match: "min",
    image: "assets/images/gift.svg",
    sound: "assets/sounds/sparkle.wav",
    avatar: false,
  },
  cheer: {
    section: "alert.cheer",
    enabled: "alert.cheer.enabled",
    text: "{name} cheered {amount} bits!",
    textHint: "alert.cheer.text_hint",
    counted: { exact: "alert.cheer.match_exact", min: "alert.cheer.match_min", amount: "alert.cheer.amount" },
    variantValue: "alert.cheer.variant_value",
    test: "alert.cheer.test",
    tiers: false,
    message: true,
    match: "min",
    image: "assets/images/explosion.svg",
    sound: "assets/sounds/coin.wav",
    avatar: false,
  },
  raid: {
    section: "alert.raid",
    enabled: "alert.raid.enabled",
    text: "{name} is raiding with {amount} viewers!",
    textHint: "alert.raid.text_hint",
    counted: { exact: "alert.raid.match_exact", min: "alert.raid.match_min", amount: "alert.raid.amount" },
    variantValue: "alert.raid.variant_value",
    test: "alert.raid.test",
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
  return {
    text: textSetting({
      label: "alert.text",
      group,
      section,
      hint: definition.textHint,
      default: definition.text,
      placeholder: definition.text,
    }),
    image: mediaSetting({
      label: "alert.image",
      group,
      section,
      hint: "alert.image.hint",
      accepts: ["image", "video"],
      builtIns: imageBuiltIns,
      default: definition.image,
    }),
    avatar: booleanSetting({ label: "alert.avatar", group, section, default: definition.avatar }),
    sound: mediaSetting({ label: "alert.sound", group, section, accepts: ["sound"], builtIns: soundBuiltIns, default: definition.sound }),
    duration: numberSetting({ label: "alert.duration", group, section, default: 6, min: 2, max: 30, unit: "unit.seconds" }),
  };
}

function variantSettings(definition: AlertTypeDefinition) {
  const { counted } = definition;
  const amountOptions: readonly SettingOption<VariantMatch>[] =
    counted === null
      ? []
      : [
          { value: "exact", label: counted.exact },
          { value: "min", label: counted.min },
        ];
  const tierOptions: readonly SettingOption<VariantMatch>[] = definition.tiers ? [{ value: "tier", label: "alert.match_tier" }] : [];
  return {
    match: choiceSetting<VariantMatch>({
      label: "alert.when",
      group: "",
      default: definition.match,
      options: [...amountOptions, ...tierOptions, { value: "user", label: "alert.match_user" }],
    }),
    value: textSetting({ label: definition.variantValue, group: "", default: "" }),
    ...presentationSettings(definition, ""),
  };
}

function speechModeOptions(definition: AlertTypeDefinition): readonly SettingOption<SpeechMode>[] {
  return [
    { value: "off", label: "speech.off" },
    { value: "text", label: "speech.text" },
    ...(definition.message
      ? ([
          { value: "message", label: "speech.message" },
          { value: "both", label: "speech.both" },
        ] as const)
      : []),
  ];
}

function alertTypeSettings<T extends AlertType>(type: T) {
  const definition = alertTypeDefinitions[type];
  const { section } = definition;
  return prefixed(type, {
    enabled: booleanSetting({ label: definition.enabled, group: section, section, default: true, sectionToggle: true }),
    ...presentationSettings(definition, section, section),
    tts: choiceSetting<SpeechMode>({ label: "alert.tts", group: speechGroup, section, default: "off", options: speechModeOptions(definition) }),
    variants: listSetting({
      label: "alert.variants",
      group: "group.variants",
      section,
      hint: "alert.variants.hint",
      itemSchema: variantSettings(definition),
      itemLabel: "alert.variant",
      addLabel: "alert.variant.add",
      maxItems: maxVariants,
      default: [],
    }),
  });
}

export const alertboxSettings = {
  volume: numberSetting({ label: "alertbox.volume", group: "group.sound", section: generalSection, default: 70, min: 0, max: 100, unit: "%" }),

  layout: choiceSetting({
    label: "setting.layout",
    group: "group.appearance",
    section: generalSection,
    default: "stacked",
    options: [
      { value: "stacked", label: "alertbox.layout.stacked" },
      { value: "side", label: "alertbox.layout.side" },
    ],
  }),
  animation: choiceSetting({
    label: "setting.animation",
    group: "group.appearance",
    section: generalSection,
    default: "pop",
    options: [
      { value: "pop", label: "alertbox.animation.pop" },
      { value: "fade", label: "alertbox.animation.fade" },
      { value: "slide", label: "setting.animation.slide" },
    ],
  }),
  imageSize: numberSetting({ label: "alertbox.image_size", group: "group.appearance", section: generalSection, default: 160, min: 40, max: 600, step: 10, unit: "px" }),
  videoWidth: numberSetting({ label: "alertbox.video_width", group: "group.appearance", section: generalSection, default: 480, min: 100, max: 1920, step: 10, unit: "px" }),
  ...appearanceSettings(generalSection, 36),

  ttsVoice: textSetting({
    label: "alertbox.voice",
    group: speechGroup,
    section: generalSection,
    hint: "alertbox.voice.hint",
    default: "",
    placeholder: "alertbox.voice.placeholder",
    suggestionsUrl: "/api/tts/voices",
  }),
  ttsVolume: numberSetting({ label: "alertbox.voice_volume", group: speechGroup, section: generalSection, default: 80, min: 0, max: 100, unit: "%" }),
  ttsMaxLength: numberSetting({
    label: "alertbox.max_length",
    group: speechGroup,
    section: generalSection,
    default: 200,
    min: 20,
    max: 500,
    step: 10,
    unit: "unit.characters",
  }),

  ...sizeSettings(generalSection, 600, 400),

  ...alertTypeSettings("follow"),
  ...alertTypeSettings("sub"),
  ...alertTypeSettings("gift"),
  ...alertTypeSettings("cheer"),
  ...alertTypeSettings("raid"),

  subTtsTiers: multiChoiceSetting<SubTier>({
    label: "alertbox.tts_tiers",
    group: speechGroup,
    section: alertTypeDefinitions.sub.section,
    default: subTiers,
    options: subTiers.map((tier) => ({ value: tier, label: tierLabel(tier) })),
  }),
  giftTtsMin: numberSetting({
    label: "alertbox.tts_from",
    group: speechGroup,
    section: alertTypeDefinitions.gift.section,
    default: 5,
    min: 1,
    max: 1000,
    unit: "unit.subs",
  }),
  cheerTtsMin: numberSetting({
    label: "alertbox.tts_from",
    group: speechGroup,
    section: alertTypeDefinitions.cheer.section,
    default: 100,
    min: 1,
    max: 1000000,
    unit: "unit.bits",
  }),
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
  const entry = Object.entries(alertTypeDefinitions).find(([, definition]) => definition.section === section);
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
