import { subscribeToCompanionEvent } from "./companion-events.ts";
import { isRecord } from "./json.ts";

// Types
export type AlertAction = "pause" | "resume" | "skip" | "replay";

export interface AlertControlStatus {
  readonly paused: boolean;
  readonly hasLastAlert: boolean;
  readonly skip: boolean;
}

// Parsing
export function parseAlertControl(data: unknown): AlertControlStatus {
  const source = isRecord(data) ? data : {};
  return { paused: source["paused"] === true, hasLastAlert: source["hasLastAlert"] === true, skip: source["skip"] === true };
}

// Requests
export async function fetchAlertControl(): Promise<AlertControlStatus> {
  try {
    const response = await fetch("/api/alerts/control", { cache: "no-store" });
    return parseAlertControl(response.ok ? await response.json() : null);
  } catch {
    return parseAlertControl(null);
  }
}

export async function sendAlertAction(action: AlertAction): Promise<AlertControlStatus> {
  const response = await fetch("/api/alerts/control", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!response.ok) {
    throw new Error(response.status === 409 ? await response.text() : `HTTP ${response.status}`);
  }
  return parseAlertControl(await response.json());
}

export function subscribeToAlertControl(listener: (status: AlertControlStatus) => void): () => void {
  return subscribeToCompanionEvent("alert-control", (data) => listener(parseAlertControl(data)));
}
