import type { ChatboxConfig } from "./chatbox-config.ts";

// Constants
const fallbackFonts = "system-ui, sans-serif";
const textShadow = "0 1px 2px rgb(0 0 0 / 80%)";

// Style
export function applyChatboxStyle(root: HTMLElement, config: ChatboxConfig): void {
  const { style } = root;
  style.setProperty("--font-family", toFontFamily(config.fontFamily));
  style.setProperty("--font-size", `${config.fontSize}px`);
  style.setProperty("--font-weight", config.fontWeight);
  style.setProperty("--color-text", config.textColor);
  style.setProperty("--text-shadow", config.textShadow ? textShadow : "none");
  style.setProperty("--message-background", config.messageBackground);
  style.setProperty("--message-padding", isTransparent(config.messageBackground) ? "0" : "3px 8px");
  style.setProperty("--message-spacing", `${config.messageSpacing}px`);
  style.setProperty("--emote-height", `${config.emoteSize / 100}em`);
  root.dataset["alignment"] = config.alignment;
  root.dataset["animation"] = config.animation;
}

export function toFontFamily(fontFamily: string): string {
  const name = fontFamily.replace(/["\\;{}]/g, "").trim();
  return name === "" ? fallbackFonts : `"${name}", ${fallbackFonts}`;
}

export function isTransparent(color: string): boolean {
  return color.length === 9 && color.endsWith("00");
}
