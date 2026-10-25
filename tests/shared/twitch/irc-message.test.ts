import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getNick, parseIrcMessage } from "../../../src/shared/twitch/irc-message.ts";

describe("parseIrcMessage", () => {
  test("parses a command with trailing parameter", () => {
    const message = parseIrcMessage("PING :tmi.twitch.tv");
    assert.ok(message);
    assert.equal(message.command, "PING");
    assert.equal(message.prefix, null);
    assert.deepEqual(message.params, ["tmi.twitch.tv"]);
    assert.equal(message.tags.size, 0);
  });

  test("parses tags, prefix and parameters", () => {
    const message = parseIrcMessage(
      "@color=#FF4500;display-name=Tester;user-id=42 :tester!tester@tester.tmi.twitch.tv PRIVMSG #channel :hello there :)",
    );
    assert.ok(message);
    assert.equal(message.command, "PRIVMSG");
    assert.equal(message.prefix, "tester!tester@tester.tmi.twitch.tv");
    assert.deepEqual(message.params, ["#channel", "hello there :)"]);
    assert.equal(message.tags.get("color"), "#FF4500");
    assert.equal(message.tags.get("user-id"), "42");
  });

  test("unescapes tag values and keeps empty tags", () => {
    const message = parseIrcMessage("@system-msg=Hello\\sWorld\\:\\\\x\\n;empty=;flag :tmi.twitch.tv USERNOTICE #channel");
    assert.ok(message);
    assert.equal(message.tags.get("system-msg"), "Hello World;\\x\n");
    assert.equal(message.tags.get("empty"), "");
    assert.equal(message.tags.get("flag"), "");
  });

  test("parses middle parameters without trailing", () => {
    const message = parseIrcMessage(":tmi.twitch.tv 001 justinfan12345 :Welcome, GLHF!\r\n");
    assert.ok(message);
    assert.equal(message.command, "001");
    assert.deepEqual(message.params, ["justinfan12345", "Welcome, GLHF!"]);
  });

  test("rejects empty lines", () => {
    assert.equal(parseIrcMessage(""), null);
  });
});

describe("getNick", () => {
  test("extracts the nick from a full prefix", () => {
    assert.equal(getNick("tester!tester@tester.tmi.twitch.tv"), "tester");
  });

  test("returns server prefixes unchanged", () => {
    assert.equal(getNick("tmi.twitch.tv"), "tmi.twitch.tv");
    assert.equal(getNick(null), null);
  });
});
