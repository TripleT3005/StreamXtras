import { isAlertType, isSubTier, type AlertType, type SubTier } from "./alerts.ts";
import { subscribeToCompanionEvent } from "./companion-events.ts";
import { fetchJson } from "./http.ts";
import { asArray, isRecord } from "./json.ts";

// Types
export interface RecentEntry {
  readonly type: AlertType;
  readonly userName: string;
  readonly amount: number;
  readonly tier: SubTier | null;
  readonly message: string;
}

export interface StreamStats {
  readonly followers: number | null;
  readonly subscribers: number | null;
  readonly subPoints: number | null;
  readonly recent: ReadonlyMap<AlertType, readonly RecentEntry[]>;
}

// Parsing
export function parseStats(data: unknown): StreamStats {
  const source = isRecord(data) ? data : {};
  const recent = new Map<AlertType, RecentEntry[]>();
  if (isRecord(source["recent"])) {
    for (const [type, entries] of Object.entries(source["recent"])) {
      if (isAlertType(type)) {
        recent.set(type, asArray(entries).flatMap((entry) => parseEntry(type, entry)));
      }
    }
  }
  return {
    followers: count(source["followers"]),
    subscribers: count(source["subscribers"]),
    subPoints: count(source["subPoints"]),
    recent,
  };
}

function parseEntry(type: AlertType, entry: unknown): RecentEntry[] {
  if (!isRecord(entry) || typeof entry["userName"] !== "string" || entry["userName"] === "") {
    return [];
  }
  return [{ type, userName: entry["userName"], amount: count(entry["amount"]) ?? 0, tier: isSubTier(entry["tier"]) ? entry["tier"] : null, message: "" }];
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

// Loading
export async function fetchStats(): Promise<StreamStats> {
  try {
    return parseStats(await fetchJson("/api/stats"));
  } catch (error: unknown) {
    console.error("Loading the stream stats failed", error);
    return parseStats(null);
  }
}

export function subscribeToStats(listener: (stats: StreamStats) => void): () => void {
  return subscribeToCompanionEvent("stats", (data) => listener(parseStats(data)));
}
