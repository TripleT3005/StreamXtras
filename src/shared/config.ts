import { isRecord } from "./json.ts";

// Types
export type ConfigSource = Readonly<Record<string, unknown>>;

// Loading
export async function loadOverlaySettings(overlayId: string, search: string): Promise<ConfigSource> {
  const storedValues = await fetchOverlaySettings(overlayId);
  const urlValues = Object.fromEntries(new URLSearchParams(search));
  return { ...storedValues, ...urlValues };
}

export async function fetchOverlaySettings(overlayId: string): Promise<ConfigSource> {
  try {
    const response = await fetch(settingsUrl(overlayId), { cache: "no-store" });
    const data: unknown = response.ok ? await response.json() : null;
    return isRecord(data) ? data : {};
  } catch (error: unknown) {
    console.error(`Loading the settings of ${overlayId} failed`, error);
    return {};
  }
}

export async function saveOverlaySettings(overlayId: string, settings: ConfigSource): Promise<void> {
  const response = await fetch(settingsUrl(overlayId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

export function subscribeToSettings(overlayId: string, listener: (settings: ConfigSource) => void): () => void {
  const events = new EventSource("/api/events");
  events.addEventListener("settings", (event: MessageEvent<string>) => {
    const data: unknown = JSON.parse(event.data);
    if (isRecord(data) && data["overlay"] === overlayId && isRecord(data["settings"])) {
      listener(data["settings"]);
    }
  });
  return () => events.close();
}

function settingsUrl(overlayId: string): string {
  return `/api/overlays/${encodeURIComponent(overlayId)}/settings`;
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

export function readColor(source: ConfigSource, key: string, fallback: string): string {
  const value = source[key];
  return typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

export function readStringList(source: ConfigSource, key: string, fallback: readonly string[]): readonly string[] {
  const value = source[key];
  const items = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : null;
  if (items === null) {
    return fallback;
  }
  return items.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item !== "");
}
