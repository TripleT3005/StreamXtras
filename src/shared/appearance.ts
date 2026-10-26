import { toFontFamily } from "./fonts.ts";
import { booleanSetting, choiceSetting, colorSetting, fontSetting, numberSetting } from "./settings.ts";

// Types
export interface AppearanceValues {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: string;
  readonly textColor: string;
  readonly highlightColor: string;
  readonly textShadow: boolean;
}

// Constants
const fontSuggestions = ["Segoe UI", "Arial", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Impact", "Comic Sans MS"];

// Schema
export function appearanceSettings(section: string | undefined, fontSize: number) {
  const group = "Appearance";
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
      default: "700",
      options: [
        { value: "400", label: "Normal" },
        { value: "600", label: "Semibold" },
        { value: "700", label: "Bold" },
        { value: "900", label: "Black" },
      ],
    }),
    textColor: colorSetting({ label: "Text color", group, section, default: "#ffffff" }),
    highlightColor: colorSetting({ label: "Highlight color", group, section, default: "#b9a8ff" }),
    textShadow: booleanSetting({ label: "Text shadow", group, section, default: true }),
  };
}

export function sizeSettings(section: string | undefined, width: number, height: number) {
  const group = "Browser source size";
  return {
    width: numberSetting({
      label: "Width",
      group,
      section,
      hint: "Use the same size for the browser source in OBS. The preview uses it as well.",
      default: width,
      min: 100,
      max: 3840,
      unit: "px",
    }),
    height: numberSetting({ label: "Height", group, section, default: height, min: 40, max: 2160, unit: "px" }),
  };
}

// Style
export function applyAppearance(root: HTMLElement, values: AppearanceValues): void {
  const { style } = root;
  style.setProperty("--font-family", toFontFamily(values.fontFamily));
  style.setProperty("--font-size", `${values.fontSize}px`);
  style.setProperty("--font-weight", values.fontWeight);
  style.setProperty("--color-text", values.textColor);
  style.setProperty("--color-highlight", values.highlightColor);
  style.setProperty("--text-shadow", values.textShadow ? "0 2px 4px rgb(0 0 0 / 85%)" : "none");
}
