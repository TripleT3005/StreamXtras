import type { ConfigSource } from "../../shared/config.ts";
import {
  booleanSetting,
  choiceSetting,
  colorSetting,
  fontSetting,
  mediaSetting,
  numberSetting,
  readSettings,
  textSetting,
  type SettingOption,
  type SettingsSchema,
  type SettingsValues,
} from "../../shared/settings.ts";
import type { AlertType } from "./alert.ts";

// Constants
export const alertboxOverlayId = "alertbox";

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

// Schema
export const alertboxSettings = {
  followEnabled: booleanSetting({ label: "Show follow alerts", group: "Follow", default: true }),
  followText: textSetting({
    label: "Text",
    group: "Follow",
    hint: "{name} is replaced with the name of the follower.",
    default: "{name} is now following!",
    placeholder: "{name} is now following!",
  }),
  followImage: mediaSetting({ label: "Image", group: "Follow", mediaKind: "image", builtIns: imageBuiltIns, default: "assets/images/heart.svg" }),
  followSound: mediaSetting({ label: "Sound", group: "Follow", mediaKind: "sound", builtIns: soundBuiltIns, default: "assets/sounds/chime.wav" }),
  followDuration: numberSetting({ label: "Duration", group: "Follow", default: 6, min: 2, max: 30, unit: "s" }),

  volume: numberSetting({ label: "Volume", group: "Sound", default: 70, min: 0, max: 100, unit: "%" }),

  layout: choiceSetting({
    label: "Layout",
    group: "Appearance",
    default: "stacked",
    options: [
      { value: "stacked", label: "Image above text" },
      { value: "side", label: "Image next to text" },
    ],
  }),
  animation: choiceSetting({
    label: "Animation",
    group: "Appearance",
    default: "pop",
    options: [
      { value: "pop", label: "Pop" },
      { value: "fade", label: "Fade" },
      { value: "slide", label: "Slide in" },
    ],
  }),
  imageSize: numberSetting({ label: "Image size", group: "Appearance", default: 160, min: 40, max: 600, step: 10, unit: "px" }),
  fontFamily: fontSetting({
    label: "Font",
    group: "Appearance",
    hint: "The font must be installed on the computer running OBS.",
    default: "",
    suggestions: fontSuggestions,
  }),
  fontSize: numberSetting({ label: "Font size", group: "Appearance", default: 36, min: 12, max: 120, unit: "px" }),
  fontWeight: choiceSetting({
    label: "Font weight",
    group: "Appearance",
    default: "700",
    options: [
      { value: "400", label: "Normal" },
      { value: "600", label: "Semibold" },
      { value: "700", label: "Bold" },
      { value: "900", label: "Black" },
    ],
  }),
  textColor: colorSetting({ label: "Text color", group: "Appearance", default: "#ffffff" }),
  highlightColor: colorSetting({ label: "Name color", group: "Appearance", default: "#bf94ff" }),
  textShadow: booleanSetting({ label: "Text shadow", group: "Appearance", default: true }),

  width: numberSetting({
    label: "Width",
    group: "Browser source size",
    hint: "Use the same size for the browser source in OBS. The preview uses it as well.",
    default: 600,
    min: 100,
    max: 3840,
    unit: "px",
  }),
  height: numberSetting({ label: "Height", group: "Browser source size", default: 400, min: 100, max: 2160, unit: "px" }),
} satisfies SettingsSchema;

// Types
export type AlertboxConfig = SettingsValues<typeof alertboxSettings>;

export interface AlertStyle {
  readonly enabled: boolean;
  readonly text: string;
  readonly image: string;
  readonly sound: string;
  readonly durationMs: number;
}

// Reading
export function readAlertboxConfig(source: ConfigSource): AlertboxConfig {
  return readSettings(alertboxSettings, source);
}

export function alertStyle(config: AlertboxConfig, type: AlertType): AlertStyle {
  switch (type) {
    case "follow":
      return {
        enabled: config.followEnabled,
        text: config.followText,
        image: config.followImage,
        sound: config.followSound,
        durationMs: config.followDuration * 1000,
      };
  }
}
