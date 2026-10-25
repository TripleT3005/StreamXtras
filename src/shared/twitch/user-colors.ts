import { contrastRatio, labToRgb, parseHexColor, rgbToLab, toHexColor, type Rgb } from "../colors.ts";

// Constants
export const defaultUserColors: readonly string[] = [
  "#FF0000",
  "#0000FF",
  "#008000",
  "#B22222",
  "#FF7F50",
  "#9ACD32",
  "#FF4500",
  "#2E8B57",
  "#DAA520",
  "#D2691E",
  "#5F9EA0",
  "#1E90FF",
  "#FF69B4",
  "#8A2BE2",
  "#00FF7F",
];

const darkChatBackground: Rgb = [15, 14, 17];
const minimumContrast = 4.5;
const maxLightenSteps = 51;
const veryDarkChannelLimit = 36;
const veryDarkReplacement = "#7a7a7a";
const readableColorCache = new Map<string, string>();

// Default colors
export function getDefaultUserColor(userId: string): string {
  let hash = 0;
  for (const character of userId) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return defaultUserColors[hash % defaultUserColors.length] ?? "#FF0000";
}

// Readability
export function toReadableColor(color: string): string {
  const cached = readableColorCache.get(color);
  if (cached !== undefined) {
    return cached;
  }
  const readable = computeReadableColor(color);
  readableColorCache.set(color, readable);
  return readable;
}

function computeReadableColor(color: string): string {
  const original = parseHexColor(color);
  if (original === null) {
    return color;
  }
  if (original.every((channel) => channel < veryDarkChannelLimit)) {
    return veryDarkReplacement;
  }

  let current: Rgb = original;
  let contrast = contrastRatio(current, darkChatBackground);
  if (contrast > minimumContrast) {
    return toHexColor(original);
  }
  for (let step = 0; step < maxLightenSteps && contrast < minimumContrast; step++) {
    const lab = rgbToLab(current);
    lab[0] += 0.1 * lab[0];
    current = labToRgb(lab);
    contrast = contrastRatio(current, darkChatBackground);
  }
  return toHexColor(current);
}
