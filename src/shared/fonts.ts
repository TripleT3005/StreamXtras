// Constants
const fallbackFonts = "system-ui, sans-serif";

// Fonts
export function toFontFamily(fontFamily: string): string {
  const name = fontFamily.replace(/["\\;{}]/g, "").trim();
  return name === "" ? fallbackFonts : `"${name}", ${fallbackFonts}`;
}
