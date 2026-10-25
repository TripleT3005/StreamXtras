import { isRecord } from "../../shared/json.ts";

// Types
export type AlertType = "follow";

export interface OverlayAlert {
  readonly type: AlertType;
  readonly userName: string;
  readonly test: boolean;
}

export type TextPart = { readonly kind: "text"; readonly text: string } | { readonly kind: "name"; readonly text: string };

// Constants
const namePlaceholder = "{name}";

// Parsing
export function parseAlert(data: unknown): OverlayAlert | null {
  if (!isRecord(data) || data["type"] !== "follow" || typeof data["userName"] !== "string" || data["userName"] === "") {
    return null;
  }
  return { type: "follow", userName: data["userName"], test: data["test"] === true };
}

export function formatAlertText(template: string, name: string): TextPart[] {
  const parts: TextPart[] = [];
  template.split(namePlaceholder).forEach((text, index) => {
    if (index > 0) {
      parts.push({ kind: "name", text: name });
    }
    if (text !== "") {
      parts.push({ kind: "text", text });
    }
  });
  return parts;
}
