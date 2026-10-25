import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chatboxSettings, readChatboxConfig } from "../../../src/overlays/chatbox/chatbox-config.ts";
import { isTransparent, toFontFamily } from "../../../src/overlays/chatbox/chatbox-style.ts";
import { defaultSettings } from "../../../src/shared/settings.ts";

describe("chat box style helpers", () => {
  test("quotes font names and falls back to the system font", () => {
    assert.equal(toFontFamily(""), "system-ui, sans-serif");
    assert.equal(toFontFamily("Segoe UI"), '"Segoe UI", system-ui, sans-serif');
    assert.equal(toFontFamily('Evil"; color: red'), '"Evil color: red", system-ui, sans-serif');
  });

  test("detects fully transparent colors", () => {
    assert.equal(isTransparent("#00000000"), true);
    assert.equal(isTransparent("#00000080"), false);
    assert.equal(isTransparent("#000000"), false);
  });
});

describe("chat box settings", () => {
  test("keep the previous defaults of the chat box", () => {
    const config = readChatboxConfig({});
    assert.deepEqual(config, defaultSettings(chatboxSettings));
    assert.equal(config.maxMessages, 30);
    assert.equal(config.fontSize, 18);
    assert.deepEqual(config.emoteProviders, ["7tv", "bttv", "ffz"]);
  });

  test("only reload for channel and emote provider changes", () => {
    const live = Object.entries(chatboxSettings)
      .filter(([, setting]) => !setting.live)
      .map(([key]) => key);
    assert.deepEqual(live, ["channel", "emoteProviders"]);
  });
});
