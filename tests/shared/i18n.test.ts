import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { alertboxSettings, alertTypeDefinitions } from "../../src/overlays/alertbox/alertbox-config.ts";
import { chatboxSettings } from "../../src/overlays/chatbox/chatbox-config.ts";
import { goalSettings } from "../../src/overlays/goal/goal-config.ts";
import { recentSettings } from "../../src/overlays/recent/recent-config.ts";
import { topEmotesSettings } from "../../src/overlays/topemotes/topemotes-config.ts";
import { isTextKey, parseLanguageFile, setTexts, t } from "../../src/shared/i18n.ts";
import type { Setting, SettingsSchema } from "../../src/shared/settings.ts";

// Helpers
const english = parseLanguageFile(readFileSync("web/lang/en.lang", "utf8"));
const optionalKeys = ["language.name", "language.fallback", "language.direction"];
const namePattern = /^[\w%]+( \d)?$/;

function sourceFiles(directory: string, extension: string): string[] {
  return readdirSync(directory, { recursive: true })
    .filter((file) => file.endsWith(extension))
    .map((file) => readFileSync(`${directory}/${file}`, "utf8"));
}

function schemaTexts(schema: SettingsSchema): string[] {
  return Object.values(schema).flatMap((setting: Setting) => [
    setting.label,
    setting.group,
    ...(setting.section === undefined ? [] : [setting.section]),
    ...(setting.hint === undefined ? [] : [setting.hint]),
    ...("unit" in setting ? [setting.unit] : []),
    ...(setting.kind === "text" && isTextKey(setting.placeholder) ? [setting.placeholder] : []),
    ...("options" in setting ? setting.options.map((option) => option.label) : []),
    ...(setting.kind === "media" ? setting.builtIns.map((option) => option.label) : []),
    ...(setting.kind === "list" ? [setting.itemLabel, setting.addLabel, ...schemaTexts(setting.itemSchema)] : []),
  ]);
}

// Tests
describe("language files", () => {
  test("parses keys, comments and line breaks", () => {
    const texts = parseLanguageFile("﻿# Comment\n; Comment\ntray.quit = Quit \r\nbroken\nempty =\nmulti = One\\nTwo\n");
    assert.deepEqual([...texts], [
      ["tray.quit", "Quit"],
      ["multi", "One\nTwo"],
    ]);
  });

  test("translates keys, keeps names and fills placeholders", () => {
    setTexts([["page.version", "Version {version}"]]);
    assert.equal(t("page.version", { version: "1.2.3" }), "Version 1.2.3");
    assert.equal(t("missing.key"), "missing.key");
    assert.equal(t("BetterTTV"), "BetterTTV");
    assert.equal(isTextKey("Tier 1"), false);
  });

  test("English contains every text of the settings", () => {
    const texts = [alertboxSettings, chatboxSettings, goalSettings, recentSettings, topEmotesSettings].flatMap(schemaTexts);
    const definitions = Object.values(alertTypeDefinitions).flatMap((definition) => [definition.test, ...Object.values(definition.counted ?? {})]);
    for (const text of [...texts, ...definitions].filter((value) => value !== "")) {
      if (isTextKey(text)) {
        assert.ok(english.has(text), `en.lang is missing ${text}`);
      } else {
        assert.ok(namePattern.test(text) || text.includes("{"), `"${text}" should be a text key`);
      }
    }
  });

  test("English contains every key used in the code and only those", () => {
    const code = [...sourceFiles("src", ".ts"), ...sourceFiles("web", ".html"), readFileSync("companion/src/i18n.rs", "utf8")].join("\n");
    const used = new Set([...code.matchAll(/"([a-z0-9_]+(?:\.[a-z0-9_]+)+)"/g)].map((match) => match[1] ?? ""));
    for (const key of english.keys()) {
      assert.ok(optionalKeys.includes(key) || used.has(key), `en.lang contains the unused text ${key}`);
    }
    for (const match of code.matchAll(/(?:\bt\(|data-text(?:-label)?=)"([^"]+)"/g)) {
      const key = match[1] ?? "";
      assert.ok(english.has(key), `en.lang is missing ${key}`);
    }
  });
});
