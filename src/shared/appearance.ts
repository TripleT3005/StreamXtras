import { toFontFamily } from "./fonts.ts";
import { booleanSetting, choiceSetting, colorSetting, fontSetting, numberSetting } from "./settings.ts";

// Types
export interface AppearanceValues {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: string;
  readonly textColor: string;
  readonly highlightColor?: string;
  readonly textShadow: boolean;
}

// Constants
const group = "Appearance";
const fontSuggestions = ["Segoe UI", "Arial", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Impact", "Consolas", "Comic Sans MS"];
const defaultTextShadow = "0 2px 4px rgb(0 0 0 / 85%)";

// Schema
export function fontSettings(section: string | undefined, fontSize: number, fontWeight = "700") {
  return {
    fontFamily: fontSetting({
      label: "Font",
      group,
      section,
      hint: "The font must be installed on the computer running OBS.",
      default: "",
      suggestions: fontSuggestions,
    }),
    fontSize: numberSetting({ label: "Font size", group, section, default: fontSize, min: 10, max: 120, unit: "px" }),
    fontWeight: choiceSetting({
      label: "Font weight",
      group,
      section,
      default: fontWeight,
      options: [
        { value: "400", label: "Normal" },
        { value: "600", label: "Semibold" },
        { value: "700", label: "Bold" },
        { value: "900", label: "Black" },
      ],
    }),
    textColor: colorSetting({ label: "Text color", group, section, default: "#ffffff" }),
  };
}

export function shadowSettings(section: string | undefined) {
  return { textShadow: booleanSetting({ label: "Text shadow", group, section, default: true }) };
}

export function appearanceSettings(section: string | undefined, fontSize: number) {
  return {
    ...fontSettings(section, fontSize),
    highlightColor: colorSetting({ label: "Highlight color", group, section, hint: "Used for names and numbers.", default: "#b9a8ff" }),
    ...shadowSettings(section),
  };
}

export function sizeSettings(section: string | undefined, width: number, height: number) {
  const sizeGroup = "Browser source size";
  return {
    width: numberSetting({
      label: "Width",
      group: sizeGroup,
      section,
      hint: "Use the same size for the browser source in OBS. The preview uses it as well.",
      default: width,
      min: 100,
      max: 3840,
      unit: "px",
    }),
    height: numberSetting({ label: "Height", group: sizeGroup, section, default: height, min: 40, max: 2160, unit: "px" }),
  };
}

// Style
export function applyAppearance(root: HTMLElement, values: AppearanceValues, textShadow = defaultTextShadow): void {
  const { style } = root;
  style.setProperty("--font-family", toFontFamily(values.fontFamily));
  style.setProperty("--font-size", `${values.fontSize}px`);
  style.setProperty("--font-weight", values.fontWeight);
  style.setProperty("--color-text", values.textColor);
  if (values.highlightColor !== undefined) {
    style.setProperty("--color-highlight", values.highlightColor);
  }
  style.setProperty("--text-shadow", values.textShadow ? textShadow : "none");
}
