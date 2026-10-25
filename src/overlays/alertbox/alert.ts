import { isRecord } from "../../shared/json.ts";

// Types
export const alertTypes = ["follow", "sub", "gift", "cheer", "raid"] as const;

export type AlertType = (typeof alertTypes)[number];

export interface OverlayAlert {
  readonly type: AlertType;
  readonly userName: string;
  readonly userLogin: string;
  readonly amount: number;
  readonly avatarUrl: string | null;
  readonly test: boolean;
}

export type TextPart = { readonly kind: "text"; readonly text: string } | { readonly kind: "highlight"; readonly text: string };

// Constants
const avatarUrlPrefix = "https://static-cdn.jtvnw.net/";

// Parsing
export function isAlertType(value: unknown): value is AlertType {
  return alertTypes.some((type) => type === value);
}

export function parseAlert(data: unknown): OverlayAlert | null {
  if (!isRecord(data) || !isAlertType(data["type"]) || typeof data["userName"] !== "string" || data["userName"] === "") {
    return null;
  }
  const { amount, avatarUrl, userLogin } = data;
  return {
    type: data["type"],
    userName: data["userName"],
    userLogin: typeof userLogin === "string" ? userLogin : "",
    amount: typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0 ? amount : 0,
    avatarUrl: typeof avatarUrl === "string" && avatarUrl.startsWith(avatarUrlPrefix) ? avatarUrl : null,
    test: data["test"] === true,
  };
}

export function formatAlertText(template: string, alert: Pick<OverlayAlert, "userName" | "amount">): TextPart[] {
  const values: Readonly<Record<string, string>> = { "{name}": alert.userName, "{amount}": String(alert.amount) };
  return template
    .split(/(\{name\}|\{amount\})/)
    .filter((text) => text !== "")
    .map((text) => {
      const value = values[text];
      return value === undefined ? { kind: "text", text } : { kind: "highlight", text: value };
    });
}
