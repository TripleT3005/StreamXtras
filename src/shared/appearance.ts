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
const group = "group.appearance";
const fontSuggestions = ["Segoe UI", "Arial", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Impact", "Consolas", "Comic Sans MS"];
const defaultTextShadow = "0 2px 4px rgb(0 0 0 / 85%)";

// Schema
export function fontSettings(section: string | undefined, fontSize: number, fontWeight = "700") {
  return {
    fontFamily: fontSetting({
      label: "setting.font",
      group,
      section,
      hint: "setting.font.hint",
      default: "",
      suggestions: fontSuggestions,
    }),
    fontSize: numberSetting({ label: "setting.font_size", group, section, default: fontSize, min: 10, max: 120, unit: "px" }),
    fontWeight: choiceSetting({
      label: "setting.font_weight",
      group,
      section,
      default: fontWeight,
      options: [
        { value: "400", label: "option.weight.normal" },
        { value: "600", label: "option.weight.semibold" },
        { value: "700", label: "option.weight.bold" },
        { value: "900", label: "option.weight.black" },
      ],
    }),
    textColor: colorSetting({ label: "setting.text_color", group, section, default: "#ffffff" }),
  };
}

export function shadowSettings(section: string | undefined) {
  return { textShadow: booleanSetting({ label: "setting.text_shadow", group, section, default: true }) };
}

export function appearanceSettings(section: string | undefined, fontSize: number) {
  return {
    ...fontSettings(section, fontSize),
    highlightColor: colorSetting({ label: "setting.highlight_color", group, section, hint: "setting.highlight_color.hint", default: "#b9a8ff" }),
    ...shadowSettings(section),
  };
}

export function sizeSettings(section: string | undefined, width: number, height: number) {
  const sizeGroup = "group.source_size";
  return {
    width: numberSetting({
      label: "setting.width",
      group: sizeGroup,
      section,
      hint: "setting.width.hint",
      default: width,
      min: 100,
      max: 3840,
      unit: "px",
    }),
    height: numberSetting({ label: "setting.height", group: sizeGroup, section, default: height, min: 40, max: 2160, unit: "px" }),
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
