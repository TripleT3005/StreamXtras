import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mapChatEvent, parseBadges, parseEmotes } from "../../../src/shared/twitch/chat-events.ts";
import { parseIrcMessage } from "../../../src/shared/twitch/irc-message.ts";

function map(line: string) {
  const message = parseIrcMessage(line);
  assert.ok(message);
  return mapChatEvent(message, 1_000);
}

describe("mapChatEvent", () => {
  test("maps a chat message with badges and emotes", () => {
    const event = map(
      "@badge-info=;badges=broadcaster/1,premium/1;color=#FF4500;display-name=Tester;emotes=25:0-4,12-16/1902:6-10;" +
        "id=msg-1;room-id=1337;tmi-sent-ts=1700000000000;user-id=42 " +
        ":tester!tester@tester.tmi.twitch.tv PRIVMSG #channel :Kappa Keepo Kappa",
    );
    assert.deepEqual(event, {
      type: "chat.message",
      platform: "twitch",
      id: "msg-1",
      channelId: "1337",
      user: {
        id: "42",
        login: "tester",
        displayName: "Tester",
        color: "#FF4500",
        badges: [
          { set: "broadcaster", version: "1" },
          { set: "premium", version: "1" },
        ],
      },
      text: "Kappa Keepo Kappa",
      isAction: false,
      emotes: [
        { id: "25", start: 0, end: 4 },
        { id: "1902", start: 6, end: 10 },
        { id: "25", start: 12, end: 16 },
      ],
      timestamp: 1_700_000_000_000,
    });
  });

  test("detects /me actions and falls back for missing optional tags", () => {
    const event = map("@id=msg-2;room-id=1;user-id=7;color=;display-name= :lowercase!lowercase@x PRIVMSG #channel :\u0001ACTION waves\u0001");
    assert.ok(event?.type === "chat.message");
    assert.equal(event.text, "waves");
    assert.equal(event.isAction, true);
    assert.equal(event.user.displayName, "lowercase");
    assert.equal(event.user.color, null);
    assert.equal(event.timestamp, 1_000);
  });

  test("ignores chat messages without id", () => {
    assert.equal(map("@user-id=7 :someone!someone@x PRIVMSG #channel :hi"), null);
  });

  test("maps a deleted message", () => {
    assert.deepEqual(map("@login=someone;room-id=1;target-msg-id=msg-3 :tmi.twitch.tv CLEARMSG #channel :bad words"), {
      type: "chat.delete",
      platform: "twitch",
      messageId: "msg-3",
    });
  });

  test("maps a timeout of one user", () => {
    assert.deepEqual(map("@ban-duration=600;room-id=1;target-user-id=99 :tmi.twitch.tv CLEARCHAT #channel :someone"), {
      type: "chat.clear",
      platform: "twitch",
      userId: "99",
    });
  });

  test("maps clearing the whole chat", () => {
    assert.deepEqual(map("@room-id=1;tmi-sent-ts=5 :tmi.twitch.tv CLEARCHAT #channel"), {
      type: "chat.clear",
      platform: "twitch",
      userId: null,
    });
  });

  test("maps the room state to a joined channel", () => {
    assert.deepEqual(map("@emote-only=0;room-id=12826;slow=0 :tmi.twitch.tv ROOMSTATE #twitch"), {
      type: "channel.joined",
      platform: "twitch",
      channelId: "12826",
      channelLogin: "twitch",
    });
  });

  test("ignores unrelated commands", () => {
    assert.equal(map(":tmi.twitch.tv 001 justinfan1 :Welcome"), null);
  });
});

describe("tag parsing", () => {
  test("parses badges and skips malformed entries", () => {
    assert.deepEqual(parseBadges("moderator/1,broken,subscriber/12"), [
      { set: "moderator", version: "1" },
      { set: "subscriber", version: "12" },
    ]);
    assert.deepEqual(parseBadges(""), []);
  });

  test("parses emotes and skips malformed ranges", () => {
    assert.deepEqual(parseEmotes("emotesv2_abc:3-7,x-y/25:0-1"), [
      { id: "25", start: 0, end: 1 },
      { id: "emotesv2_abc", start: 3, end: 7 },
    ]);
    assert.deepEqual(parseEmotes(""), []);
  });
});
