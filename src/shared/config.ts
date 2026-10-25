// Types
export type ConfigSource = Readonly<Record<string, unknown>>;

// Loading
export async function loadConfigSource(fileUrl: URL, search: string): Promise<ConfigSource> {
  const fileValues = await loadConfigFile(fileUrl);
  const urlValues = Object.fromEntries(new URLSearchParams(search));
  return { ...fileValues, ...urlValues };
}

async function loadConfigFile(fileUrl: URL): Promise<ConfigSource> {
  let response: Response;
  try {
    response = await fetch(fileUrl, { cache: "no-store" });
  } catch {
    return {};
  }
  if (!response.ok) {
    return {};
  }
  const data: unknown = await response.json().catch((error: unknown) => {
    console.error(`Invalid JSON in ${fileUrl.pathname}`, error);
    return {};
  });
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    console.error(`${fileUrl.pathname} must contain a JSON object`);
    return {};
  }
  return data as ConfigSource;
}

// Readers
export function readString(source: ConfigSource, key: string, fallback: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : fallback;
}

export function readInteger(source: ConfigSource, key: string, fallback: number, min: number, max: number): number {
  const value = source[key];
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function readBoolean(source: ConfigSource, key: string, fallback: boolean): boolean {
  const value = source[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  return fallback;
}

export function readStringList(source: ConfigSource, key: string, fallback: readonly string[]): readonly string[] {
  const value = source[key];
  const items = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : null;
  if (items === null) {
    return fallback;
  }
  return items.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item !== "");
}
