import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Emote, EmoteLookup } from "../../../src/shared/emotes/emote.ts";
import { buildFragments, type MessageFragment } from "../../../src/shared/emotes/fragments.ts";

const emotes: ReadonlyMap<string, Emote> = new Map([
  ["catJAM", { name: "catJAM", provider: "7tv", url: "7tv/catJAM", zeroWidth: false }],
  ["Kappa", { name: "Kappa", provider: "bttv", url: "bttv/Kappa", zeroWidth: false }],
  ["RainTime", { name: "RainTime", provider: "7tv", url: "7tv/RainTime", zeroWidth: true }],
  ["cvMask", { name: "cvMask", provider: "bttv", url: "bttv/cvMask", zeroWidth: true }],
]);

const lookup: EmoteLookup = { get: (name) => emotes.get(name) };

function describeFragments(fragments: readonly MessageFragment[]): string[] {
  return fragments.map((fragment) =>
    fragment.kind === "text"
      ? `text:${fragment.text}`
      : `emote:${fragment.emote.provider}:${fragment.emote.name}${fragment.overlays.map((overlay) => `+${overlay.name}`).join("")}`,
  );
}

describe("buildFragments", () => {
  test("keeps plain text as one fragment", () => {
    assert.deepEqual(describeFragments(buildFragments("hello  world", [], lookup)), ["text:hello  world"]);
  });

  test("replaces third-party emote words and keeps whitespace", () => {
    assert.deepEqual(describeFragments(buildFragments("hi catJAM there", [], lookup)), [
      "text:hi ",
      "emote:7tv:catJAM",
      "text: there",
    ]);
  });

  test("uses Twitch emote positions counted in code points", () => {
    const fragments = buildFragments("😀 Kappa 😀 Kappa", [{ id: "25", start: 2, end: 6 }, { id: "25", start: 10, end: 14 }], lookup);
    assert.deepEqual(describeFragments(fragments), ["text:😀 ", "emote:twitch:Kappa", "text: 😀 ", "emote:twitch:Kappa"]);
    const first = fragments[1];
    assert.ok(first?.kind === "emote");
    assert.equal(first.emote.url, "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0");
  });

  test("attaches zero-width emotes to the previous emote", () => {
    assert.deepEqual(describeFragments(buildFragments("look catJAM RainTime cvMask wow", [], lookup)), [
      "text:look ",
      "emote:7tv:catJAM+RainTime+cvMask",
      "text: wow",
    ]);
  });

  test("attaches zero-width emotes to Twitch emotes", () => {
    assert.deepEqual(describeFragments(buildFragments("Kappa RainTime", [{ id: "25", start: 0, end: 4 }], lookup)), [
      "emote:twitch:Kappa+RainTime",
    ]);
  });

  test("shows zero-width emotes on their own without a previous emote", () => {
    assert.deepEqual(describeFragments(buildFragments("RainTime hello RainTime", [], lookup)), [
      "emote:7tv:RainTime",
      "text: hello ",
      "emote:7tv:RainTime",
    ]);
  });

  test("ignores invalid or overlapping Twitch positions", () => {
    assert.deepEqual(describeFragments(buildFragments("Kappa", [{ id: "1", start: 0, end: 9 }], lookup)), ["emote:bttv:Kappa"]);
    assert.deepEqual(
      describeFragments(buildFragments("abc", [{ id: "1", start: 0, end: 1 }, { id: "2", start: 1, end: 2 }], lookup)),
      ["emote:twitch:ab", "text:c"],
    );
  });
});
