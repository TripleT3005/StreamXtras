import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseBttvChannel, parseBttvEmotes } from "../../../src/shared/emotes/bttv.ts";
import { parseFfzGlobal, parseFfzRoom } from "../../../src/shared/emotes/ffz.ts";
import { parseSevenTvEmoteSet } from "../../../src/shared/emotes/seven-tv.ts";

function sevenTvEmote(name: string, flags: number, dataFlags: number, files: readonly string[]) {
  return {
    id: name,
    name,
    flags,
    data: { flags: dataFlags, host: { url: `//cdn.7tv.app/emote/${name}`, files: files.map((file) => ({ name: file })) } },
  };
}

describe("7TV", () => {
  test("parses emotes, prefers 2x WebP and detects zero-width flags", () => {
    const emotes = parseSevenTvEmoteSet({
      emotes: [
        sevenTvEmote("Normal", 0, 0, ["1x.avif", "1x.webp", "2x.webp"]),
        sevenTvEmote("ActiveZw", 1, 0, ["1x.webp"]),
        sevenTvEmote("DataZw", 0, 256, ["2x.webp"]),
        sevenTvEmote("NoWebp", 0, 0, ["1x.avif"]),
        { name: "Broken" },
      ],
    });
    assert.deepEqual(emotes, [
      { name: "Normal", provider: "7tv", url: "https://cdn.7tv.app/emote/Normal/2x.webp", zeroWidth: false },
      { name: "ActiveZw", provider: "7tv", url: "https://cdn.7tv.app/emote/ActiveZw/1x.webp", zeroWidth: true },
      { name: "DataZw", provider: "7tv", url: "https://cdn.7tv.app/emote/DataZw/2x.webp", zeroWidth: true },
    ]);
  });

  test("returns nothing for missing sets", () => {
    assert.deepEqual(parseSevenTvEmoteSet(null), []);
  });
});

describe("BetterTTV", () => {
  test("parses emotes, skips modifiers and marks known zero-width emotes", () => {
    const emotes = parseBttvEmotes([
      { id: "a1", code: "catJAM", modifier: false },
      { id: "b2", code: "cvMask", modifier: false },
      { id: "c3", code: "h!", modifier: true },
    ]);
    assert.deepEqual(emotes, [
      { name: "catJAM", provider: "bttv", url: "https://cdn.betterttv.net/emote/a1/2x.webp", zeroWidth: false },
      { name: "cvMask", provider: "bttv", url: "https://cdn.betterttv.net/emote/b2/2x.webp", zeroWidth: true },
    ]);
  });

  test("combines channel and shared emotes", () => {
    const emotes = parseBttvChannel({ channelEmotes: [{ id: "1", code: "Own" }], sharedEmotes: [{ id: "2", code: "Shared" }] });
    assert.deepEqual(
      emotes.map((emote) => emote.name),
      ["Own", "Shared"],
    );
    assert.deepEqual(parseBttvChannel(null), []);
  });
});

describe("FrankerFaceZ", () => {
  const urls = { "1": "https://cdn.frankerfacez.com/emote/1/1", "2": "https://cdn.frankerfacez.com/emote/1/2" };

  test("uses only the default global sets and skips hidden and modifier emotes", () => {
    const emotes = parseFfzGlobal({
      default_sets: [3],
      sets: {
        "3": {
          emoticons: [
            { name: "Visible", urls },
            { name: "Hidden", hidden: true, urls },
            { name: "ffzX", modifier: true, urls },
          ],
        },
        "4": { emoticons: [{ name: "OtherSet", urls }] },
      },
    });
    assert.deepEqual(emotes, [{ name: "Visible", provider: "ffz", url: "https://cdn.frankerfacez.com/emote/1/2", zeroWidth: false }]);
  });

  test("prefers animated images in room sets", () => {
    const emotes = parseFfzRoom({
      room: { set: 42 },
      sets: { "42": { emoticons: [{ name: "Anim", urls, animated: { "1": "//cdn.frankerfacez.com/emote/1/animated/1" } }] } },
    });
    assert.deepEqual(emotes, [
      { name: "Anim", provider: "ffz", url: "https://cdn.frankerfacez.com/emote/1/animated/1", zeroWidth: false },
    ]);
    assert.deepEqual(parseFfzRoom(null), []);
  });
});
