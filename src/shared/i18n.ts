import { isRecord } from "./json.ts";

// Types
export type LanguageCategory = "standard" | "dialect" | "fun";

export interface LanguageInfo {
  readonly code: string;
  readonly name: string;
  readonly category: LanguageCategory;
}

export interface LanguageStatus {
  readonly code: string;
  readonly preference: string | null;
  readonly automatic: string;
  readonly direction: "ltr" | "rtl";
  readonly languages: readonly LanguageInfo[];
}

export type TextValues = Readonly<Record<string, string | number>>;

// Constants
const keyPattern = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;
const englishUrl = "/lang/en.lang";

// State
let texts: ReadonlyMap<string, string> = new Map();

// Texts
export function isTextKey(value: string): boolean {
  return keyPattern.test(value);
}

export function t(key: string, values: TextValues = {}): string {
  const text = isTextKey(key) ? (texts.get(key) ?? key) : key;
  return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), text);
}

export function setTexts(entries: Iterable<readonly [string, string]>): void {
  texts = new Map(entries);
}

export function parseLanguageFile(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of content.replace(/^﻿/, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    const separator = trimmed.indexOf("=");
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";") || separator < 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key !== "" && value !== "") {
      entries.set(key, value.replaceAll("\\n", "\n"));
    }
  }
  return entries;
}

// Loading
export async function loadLanguage(): Promise<LanguageStatus | null> {
  try {
    const response = await fetch("/api/language", { cache: "no-store" });
    const status = parseStatus(response.ok ? await response.json() : null);
    if (status !== null) {
      document.documentElement.lang = status.code;
      document.documentElement.dir = status.direction;
      return status;
    }
  } catch {
    setTexts([]);
  }
  try {
    const response = await fetch(englishUrl, { cache: "no-store" });
    setTexts(parseLanguageFile(response.ok ? await response.text() : ""));
  } catch {
    setTexts([]);
  }
  return null;
}

export async function saveLanguage(code: string | null): Promise<void> {
  const response = await fetch("/api/language", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: code }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

function parseStatus(data: unknown): LanguageStatus | null {
  if (!isRecord(data) || typeof data["code"] !== "string" || !isRecord(data["texts"])) {
    return null;
  }
  setTexts(Object.entries(data["texts"]).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const languages = Array.isArray(data["languages"]) ? data["languages"].flatMap(parseLanguage) : [];
  return {
    code: data["code"],
    preference: typeof data["preference"] === "string" ? data["preference"] : null,
    automatic: typeof data["automatic"] === "string" ? data["automatic"] : "en",
    direction: data["direction"] === "rtl" ? "rtl" : "ltr",
    languages,
  };
}

function parseLanguage(data: unknown): LanguageInfo[] {
  if (!isRecord(data) || typeof data["code"] !== "string" || typeof data["name"] !== "string") {
    return [];
  }
  const category = data["category"] === "dialect" || data["category"] === "fun" ? data["category"] : "standard";
  return [{ code: data["code"], name: data["name"], category }];
}

// Static texts
export function translatePage(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>("[data-text]")) {
    element.textContent = t(element.dataset["text"] ?? "");
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-text-label]")) {
    element.setAttribute("aria-label", t(element.dataset["textLabel"] ?? ""));
  }
}
