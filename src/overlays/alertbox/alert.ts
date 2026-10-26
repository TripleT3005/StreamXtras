import { isRecord } from "../../shared/json.ts";

// Types
export const alertTypes = ["follow", "sub", "gift", "cheer", "raid"] as const;

export type AlertType = (typeof alertTypes)[number];

export const subTiers = ["prime", "1", "2", "3"] as const;

export type SubTier = (typeof subTiers)[number];

export interface OverlayAlert {
  readonly type: AlertType;
  readonly userName: string;
  readonly userLogin: string;
  readonly amount: number;
  readonly tier: SubTier | null;
  readonly message: string;
  readonly avatarUrl: string | null;
  readonly test: boolean;
}

export type AlertText = Pick<OverlayAlert, "userName" | "amount" | "tier" | "message">;

export type TextPart = { readonly kind: "text"; readonly text: string } | { readonly kind: "highlight"; readonly text: string };

// Constants
const avatarUrlPrefix = "https://static-cdn.jtvnw.net/";
const placeholderPattern = /(\{name\}|\{amount\}|\{tier\}|\{message\})/;

// Parsing
export function isAlertType(value: unknown): value is AlertType {
  return alertTypes.some((type) => type === value);
}

export function isSubTier(value: unknown): value is SubTier {
  return subTiers.some((tier) => tier === value);
}

export function parseAlert(data: unknown): OverlayAlert | null {
  if (!isRecord(data) || !isAlertType(data["type"]) || typeof data["userName"] !== "string" || data["userName"] === "") {
    return null;
  }
  const { amount, avatarUrl, message, tier, userLogin } = data;
  return {
    type: data["type"],
    userName: data["userName"],
    userLogin: typeof userLogin === "string" ? userLogin : "",
    amount: typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0 ? amount : 0,
    tier: isSubTier(tier) ? tier : null,
    message: typeof message === "string" ? message.trim() : "",
    avatarUrl: typeof avatarUrl === "string" && avatarUrl.startsWith(avatarUrlPrefix) ? avatarUrl : null,
    test: data["test"] === true,
  };
}

// Text
export function tierLabel(tier: SubTier | null): string {
  if (tier === null) {
    return "";
  }
  return tier === "prime" ? "Prime" : `Tier ${tier}`;
}

export function formatAlertText(template: string, alert: AlertText): TextPart[] {
  const highlights: Readonly<Record<string, string>> = {
    "{name}": alert.userName,
    "{amount}": String(alert.amount),
    "{tier}": tierLabel(alert.tier),
  };
  return template
    .split(placeholderPattern)
    .map((text): TextPart => {
      if (text === "{message}") {
        return { kind: "text", text: alert.message };
      }
      const value = highlights[text];
      return value === undefined ? { kind: "text", text } : { kind: "highlight", text: value };
    })
    .filter((part) => part.text !== "");
}

export function plainAlertText(template: string, alert: AlertText): string {
  return formatAlertText(template, alert)
    .map((part) => part.text)
    .join("")
    .trim();
}
