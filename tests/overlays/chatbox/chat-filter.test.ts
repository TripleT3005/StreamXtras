import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createChatFilter } from "../../../src/overlays/chatbox/chat-filter.ts";
import type { ChatMessageEvent } from "../../../src/shared/events.ts";

// Helpers
function message(login: string, text: string, userId = `id-${login}`): ChatMessageEvent {
  return {
    type: "chat.message",
    platform: "twitch",
    id: `${login}-${text}`,
    channelId: "42",
    sourceChannelId: null,
    user: { id: userId, login, displayName: login, color: null, badges: [] },
    text,
    isAction: false,
    announcement: null,
    emotes: [],
    timestamp: 0,
  };
}

// Tests
describe("chat filter", () => {
  test("shows everything by default", () => {
    const hides = createChatFilter({ hiddenBots: [], hiddenUsers: "", blockedWords: "" });
    assert.equal(hides(message("nightbot", "hello")), false);
  });

  test("hides chosen bots, the streamer and own entries", () => {
    const hides = createChatFilter({ hiddenBots: ["nightbot", "streamer"], hiddenUsers: " @MyBot , other_bot,", blockedWords: "" });
    assert.equal(hides(message("nightbot", "hello")), true);
    assert.equal(hides(message("streamer", "hi", "42")), true);
    assert.equal(hides(message("mybot", "beep")), true);
    assert.equal(hides(message("other_bot", "beep")), true);
    assert.equal(hides(message("viewer", "hi")), false);
  });

  test("hides messages with blocked words as whole words or prefixes", () => {
    const hides = createChatFilter({ hiddenBots: [], hiddenUsers: "", blockedWords: "spoiler, Boss Fight, spoil*, (x)" });
    assert.equal(hides(message("viewer", "no SPOILER please")), true);
    assert.equal(hides(message("viewer", "the boss fight is next")), true);
    assert.equal(hides(message("viewer", "do not spoiling it")), true);
    assert.equal(hides(message("viewer", "(x) marks the spot")), true);
    assert.equal(hides(message("viewer", "unspoiled")), false);
    assert.equal(hides(message("viewer", "bossfight")), false);
    assert.equal(hides(message("viewer", "Grüße an alle")), false);
  });

  test("respects word boundaries outside ASCII", () => {
    const hides = createChatFilter({ hiddenBots: [], hiddenUsers: "", blockedWords: "grüße" });
    assert.equal(hides(message("viewer", "Grüße an alle")), true);
    assert.equal(hides(message("viewer", "Begrüßung")), false);
  });
});
