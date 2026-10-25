import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultUserColors, getDefaultUserColor, toReadableColor } from "../../../src/shared/twitch/user-colors.ts";

describe("toReadableColor", () => {
  test("matches the colors shown in Twitch's dark chat", () => {
    const expected: ReadonlyArray<readonly [string, string]> = [
      ["#0000FF", "#8b58ff"],
      ["#008000", "#319a24"],
      ["#8A2BE2", "#b454ff"],
      ["#B22222", "#db4a3f"],
      ["#9146FF", "#a053ff"],
      ["#001E26", "#67838d"],
      ["#5527A3", "#9560e3"],
      ["#580085", "#ae5dda"],
      ["#1560DE", "#4676f9"],
      ["#2F2CBE", "#7d64ff"],
      ["#0D26A7", "#7868f7"],
      ["#746043", "#998364"],
      ["#010186", "#8e65f4"],
      ["#0C0A5A", "#856bca"],
      ["#606903", "#858c2e"],
      ["#3C71CC", "#4d7dda"],
    ];
    for (const [color, readable] of expected) {
      assert.equal(toReadableColor(color), readable, color);
    }
  });

  test("keeps colors that are already readable", () => {
    assert.equal(toReadableColor("#FF0000"), "#ff0000");
    assert.equal(toReadableColor("#1E90FF"), "#1e90ff");
  });

  test("replaces very dark colors with grey", () => {
    assert.equal(toReadableColor("#171221"), "#7a7a7a");
    assert.equal(toReadableColor("#060606"), "#7a7a7a");
  });

  test("returns invalid values unchanged", () => {
    assert.equal(toReadableColor("red"), "red");
  });
});

describe("getDefaultUserColor", () => {
  test("returns a stable color from the Twitch palette", () => {
    const color = getDefaultUserColor("1523504578");
    assert.ok(defaultUserColors.includes(color));
    assert.equal(getDefaultUserColor("1523504578"), color);
  });

  test("spreads users across the palette", () => {
    const colors = new Set(Array.from({ length: 300 }, (_, index) => getDefaultUserColor(String(100_000 + index * 7919))));
    assert.equal(colors.size, defaultUserColors.length);
  });
});
