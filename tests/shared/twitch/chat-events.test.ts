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
      announcement: null,
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

  test("maps an announcement with its color and the sender from the login tag", () => {
    const event = map(
      "@badges=moderator/1;color=#1E90FF;display-name=ModName;emotes=25:6-10;id=ann-1;login=modname;mod=1;msg-id=announcement;" +
        "msg-param-color=ORANGE;room-id=1337;system-msg=;tmi-sent-ts=1700000000001;user-id=77 " +
        ":tmi.twitch.tv USERNOTICE #channel :Hello Kappa",
    );
    assert.ok(event?.type === "chat.message");
    assert.equal(event.id, "ann-1");
    assert.equal(event.announcement, "orange");
    assert.equal(event.user.login, "modname");
    assert.equal(event.user.displayName, "ModName");
    assert.equal(event.text, "Hello Kappa");
    assert.deepEqual(event.emotes, [{ id: "25", start: 6, end: 10 }]);
  });

  test("falls back to the primary announcement color", () => {
    const event = map("@id=ann-2;login=mod;msg-id=announcement;user-id=1 :tmi.twitch.tv USERNOTICE #channel :Hi");
    assert.ok(event?.type === "chat.message");
    assert.equal(event.announcement, "primary");
  });

  test("maps announcements forwarded from a shared chat", () => {
    const event = map(
      "@badges=;id=ann-3;login=othermod;msg-id=sharedchatnotice;msg-param-color=BLUE;source-badges=moderator/1;" +
        "source-msg-id=announcement;source-room-id=99;user-id=5 :tmi.twitch.tv USERNOTICE #channel :From the other channel",
    );
    assert.ok(event?.type === "chat.message");
    assert.equal(event.announcement, "blue");
    assert.deepEqual(event.user.badges, [{ set: "moderator", version: "1" }]);
  });

  test("ignores other user notices such as subscriptions", () => {
    assert.equal(map("@id=sub-1;login=fan;msg-id=resub;user-id=2 :tmi.twitch.tv USERNOTICE #channel :Great stream"), null);
    assert.equal(
      map("@id=sub-2;login=fan;msg-id=sharedchatnotice;source-msg-id=sub;user-id=2 :tmi.twitch.tv USERNOTICE #channel"),
      null,
    );
  });

  test("prefers the source badges of shared chat messages", () => {
    const event = map("@badges=;source-badges=vip/1;id=m;user-id=3 :fan!fan@fan.tmi.twitch.tv PRIVMSG #channel :hi");
    assert.ok(event?.type === "chat.message");
    assert.deepEqual(event.user.badges, [{ set: "vip", version: "1" }]);
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
