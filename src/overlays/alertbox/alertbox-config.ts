import type { ConfigSource } from "../../shared/config.ts";
import {
  booleanSetting,
  choiceSetting,
  colorSetting,
  fontSetting,
  listSetting,
  mediaSetting,
  numberSetting,
  readSettings,
  textSetting,
  type SettingOption,
  type SettingsSchema,
  type SettingsValues,
} from "../../shared/settings.ts";
import type { AlertType, OverlayAlert } from "./alert.ts";

// Types
interface AlertTypeDefinition {
  readonly label: string;
  readonly text: string;
  readonly amount: string | null;
  readonly match: VariantMatch;
  readonly image: string;
  readonly sound: string;
  readonly avatar: boolean;
}

type Prefixed<P extends string, S> = { readonly [K in keyof S & string as `${P}${Capitalize<K>}`]: S[K] };

export type VariantMatch = "exact" | "min" | "user";

// Constants
export const alertboxOverlayId = "alertbox";
export const generalSection = "General";
const maxVariants = 20;

const soundBuiltIns: readonly SettingOption<string>[] = [
  { value: "assets/sounds/chime.wav", label: "Chime" },
  { value: "assets/sounds/pop.wav", label: "Pop" },
  { value: "assets/sounds/bell.wav", label: "Bell" },
];

const imageBuiltIns: readonly SettingOption<string>[] = [
  { value: "assets/images/heart.svg", label: "Heart" },
  { value: "assets/images/star.svg", label: "Star" },
  { value: "assets/images/sparkles.svg", label: "Sparkles" },
];

const fontSuggestions = ["Segoe UI", "Arial", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Impact", "Comic Sans MS"];

export const alertTypeDefinitions: Readonly<Record<AlertType, AlertTypeDefinition>> = {
  follow: {
    label: "Follow",
    text: "{name} is now following!",
    amount: null,
    match: "user",
    image: "assets/images/heart.svg",
    sound: "assets/sounds/chime.wav",
    avatar: false,
  },
  sub: {
    label: "Subscription",
    text: "{name} just subscribed!",
    amount: "months",
    match: "min",
    image: "assets/images/star.svg",
    sound: "assets/sounds/bell.wav",
    avatar: false,
  },
  gift: {
    label: "Gift subs",
    text: "{name} gifted {amount} subs!",
    amount: "gifted subs",
    match: "min",
    image: "assets/images/sparkles.svg",
    sound: "assets/sounds/bell.wav",
    avatar: false,
  },
  cheer: {
    label: "Cheer",
    text: "{name} cheered {amount} bits!",
    amount: "bits",
    match: "min",
    image: "assets/images/sparkles.svg",
    sound: "assets/sounds/pop.wav",
    avatar: false,
  },
  raid: {
    label: "Raid",
    text: "{name} is raiding with {amount} viewers!",
    amount: "viewers",
    match: "user",
    image: "assets/images/star.svg",
    sound: "assets/sounds/bell.wav",
    avatar: true,
  },
};

// Schema
function presentationSettings(definition: AlertTypeDefinition, group: string, section?: string) {
  const amountHint = definition.amount === null ? "" : ` {amount} is replaced with the number of ${definition.amount}.`;
  return {
    text: textSetting({
      label: "Text",
      group,
      section,
      hint: `{name} is replaced with the name.${amountHint}`,
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
  return {
    match: choiceSetting<VariantMatch>({
      label: "When",
      group: "",
      default: definition.match,
      options: [...amountOptions, { value: "user", label: "From this Twitch user" }],
    }),
    value: textSetting({ label: definition.amount === null ? "Twitch name" : "Number or Twitch name", group: "", default: "" }),
    ...presentationSettings(definition, ""),
  };
}

function prefixed<P extends string, S extends SettingsSchema>(prefix: P, schema: S): Prefixed<P, S> {
  return Object.fromEntries(
    Object.entries(schema).map(([key, setting]) => [`${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`, setting]),
  ) as Prefixed<P, S>;
}

function alertTypeSettings<T extends AlertType>(type: T) {
  const definition = alertTypeDefinitions[type];
  const section = definition.label;
  return prefixed(type, {
    enabled: booleanSetting({ label: `${definition.label} alerts`, group: section, section, default: true, sectionToggle: true }),
    ...presentationSettings(definition, section, section),
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
  fontFamily: fontSetting({
    label: "Font",
    group: "Appearance",
    section: generalSection,
    hint: "The font must be installed on the computer running OBS.",
    default: "",
    suggestions: fontSuggestions,
  }),
  fontSize: numberSetting({ label: "Font size", group: "Appearance", section: generalSection, default: 36, min: 12, max: 120, unit: "px" }),
  fontWeight: choiceSetting({
    label: "Font weight",
    group: "Appearance",
    section: generalSection,
    default: "700",
    options: [
      { value: "400", label: "Normal" },
      { value: "600", label: "Semibold" },
      { value: "700", label: "Bold" },
      { value: "900", label: "Black" },
    ],
  }),
  textColor: colorSetting({ label: "Text color", group: "Appearance", section: generalSection, default: "#ffffff" }),
  highlightColor: colorSetting({
    label: "Highlight color",
    group: "Appearance",
    section: generalSection,
    hint: "Used for the name and the number.",
    default: "#bf94ff",
  }),
  textShadow: booleanSetting({ label: "Text shadow", group: "Appearance", section: generalSection, default: true }),

  width: numberSetting({
    label: "Width",
    group: "Browser source size",
    section: generalSection,
    hint: "Use the same size for the browser source in OBS. The preview uses it as well.",
    default: 600,
    min: 100,
    max: 3840,
    unit: "px",
  }),
  height: numberSetting({ label: "Height", group: "Browser source size", section: generalSection, default: 400, min: 100, max: 2160, unit: "px" }),

  ...alertTypeSettings("follow"),
  ...alertTypeSettings("sub"),
  ...alertTypeSettings("gift"),
  ...alertTypeSettings("cheer"),
  ...alertTypeSettings("raid"),
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

type AlertFacts = Pick<OverlayAlert, "type" | "userName" | "userLogin" | "amount">;

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

export function variantMatches(variant: Pick<AlertVariant, "match" | "value">, alert: Omit<AlertFacts, "type">): boolean {
  const value = variant.value.trim();
  if (variant.match === "user") {
    const name = value.replace(/^@/, "").toLowerCase();
    return name !== "" && (alert.userLogin.toLowerCase() === name || alert.userName.toLowerCase() === name);
  }
  if (!/^\d+$/.test(value)) {
    return false;
  }
  return variant.match === "exact" ? alert.amount === Number(value) : alert.amount >= Number(value);
}
