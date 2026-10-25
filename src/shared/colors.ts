// Types
export type Rgb = readonly [number, number, number];

type Lab = [number, number, number];

// Constants
const referenceWhite: Rgb = [95.047, 100, 108.883];

// Hex
export function parseHexColor(value: string): Rgb | null {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value.trim());
  if (match === null) {
    return null;
  }
  return [parseInt(match[1] ?? "", 16), parseInt(match[2] ?? "", 16), parseInt(match[3] ?? "", 16)];
}

export function toHexColor(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0")).join("")}`;
}

// Contrast
export function contrastRatio(first: Rgb, second: Rgb): number {
  const firstLuminance = relativeLuminance(first) + 0.05;
  const secondLuminance = relativeLuminance(second) + 0.05;
  return firstLuminance > secondLuminance ? firstLuminance / secondLuminance : secondLuminance / firstLuminance;
}

function relativeLuminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

// Lab
export function rgbToLab(rgb: Rgb): Lab {
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value > 0.04045 ? ((value + 0.055) / 1.055) ** 2.4 : value / 12.92;
  }) as [number, number, number];

  const x = (red * 0.4124 + green * 0.3576 + blue * 0.1805) * 100;
  const y = (red * 0.2126 + green * 0.7152 + blue * 0.0722) * 100;
  const z = (red * 0.0193 + green * 0.1192 + blue * 0.9505) * 100;

  const fx = labCurve(x / referenceWhite[0]);
  const fy = labCurve(y / referenceWhite[1]);
  const fz = labCurve(z / referenceWhite[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb(lab: Lab): [number, number, number] {
  const [lightness, a, b] = lab;
  const y = lightness <= 8 ? (100 * lightness) / 903.3 : 100 * ((lightness + 16) / 116) ** 3;
  const fy = lightness <= 8 ? (y / 100) * 7.787 + 16 / 116 : (y / 100) ** (1 / 3);
  const x = (referenceWhite[0] * (a / 500 + fy) ** 3) / 100;
  const z = (referenceWhite[2] * (fy - b / 200) ** 3) / 100;
  const yRatio = y / 100;

  return [
    3.2406 * x - 1.5372 * yRatio - 0.4986 * z,
    -0.9689 * x + 1.8758 * yRatio + 0.0415 * z,
    0.0557 * x - 0.204 * yRatio + 1.057 * z,
  ].map((value) => {
    const encoded = value > 0.0031308 ? 1.055 * value ** (1 / 2.4) - 0.055 : value * 12.92;
    return Math.min(Math.max(0, encoded), 1) * 255;
  }) as [number, number, number];
}

function labCurve(value: number): number {
  return value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116;
}
