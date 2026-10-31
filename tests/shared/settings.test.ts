import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  booleanSetting,
  choiceSetting,
  colorSetting,
  defaultSettings,
  hasStructuralChange,
  listSetting,
  multiChoiceSetting,
  numberSetting,
  readSettings,
  textSetting,
} from "../../src/shared/settings.ts";

const schema = {
  channel: textSetting({ label: "Channel", group: "General", default: "", live: false }),
  size: numberSetting({ label: "Size", group: "Look", default: 18, min: 10, max: 64 }),
  shadow: booleanSetting({ label: "Shadow", group: "Look", default: true }),
  color: colorSetting({ label: "Color", group: "Look", default: "#ffffff" }),
  align: choiceSetting({
    label: "Align",
    group: "Look",
    default: "bottom",
    options: [
      { value: "bottom", label: "Bottom" },
      { value: "top", label: "Top" },
    ],
  }),
  providers: multiChoiceSetting({
    label: "Providers",
    group: "Twitch",
    default: ["a", "b"],
    live: false,
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
      { value: "c", label: "C" },
    ],
  }),
};

describe("readSettings", () => {
  test("returns defaults for an empty source", () => {
    assert.deepEqual(readSettings(schema, {}), defaultSettings(schema));
    assert.deepEqual(defaultSettings(schema), {
      channel: "",
      size: 18,
      shadow: true,
      color: "#ffffff",
      align: "bottom",
      providers: ["a", "b"],
    });
  });

  test("reads and validates stored and URL values", () => {
    const settings = readSettings(schema, {
      channel: " name ",
      size: "100",
      shadow: "false",
      color: "#AABBCC80",
      align: "top",
      providers: "c, a, unknown",
    });
    assert.deepEqual(settings, {
      channel: "name",
      size: 64,
      shadow: false,
      color: "#aabbcc80",
      align: "top",
      providers: ["a", "c"],
    });
  });

  test("falls back for invalid values", () => {
    const settings = readSettings(schema, { color: "red", align: "middle", size: "big" });
    assert.equal(settings.color, "#ffffff");
    assert.equal(settings.align, "bottom");
    assert.equal(settings.size, 18);
  });
});

describe("listSetting", () => {
  const list = {
    items: listSetting({
      label: "Items",
      group: "Items",
      default: [],
      itemLabel: "Item",
      addLabel: "Add item",
      maxItems: 2,
      itemSchema: {
        name: textSetting({ label: "Name", group: "", default: "" }),
        size: numberSetting({ label: "Size", group: "", default: 5, min: 1, max: 9 }),
      },
    }),
  };

  test("reads every item with the item schema and limits the count", () => {
    const settings = readSettings(list, { items: [{ name: " a ", size: 99 }, "broken", {}, { name: "c" }] });
    assert.deepEqual(settings.items, [
      { name: "a", size: 9 },
      { name: "", size: 5 },
    ]);
  });

  test("falls back for values that are not lists", () => {
    assert.deepEqual(readSettings(list, { items: "a,b" }).items, []);
    assert.deepEqual(readSettings(list, {}).items, []);
  });
});

describe("hasStructuralChange", () => {
  test("detects changes of settings that are not applied live", () => {
    const base = defaultSettings(schema);
    assert.equal(hasStructuralChange(schema, base, { ...base, size: 30, align: "top" }), false);
    assert.equal(hasStructuralChange(schema, base, { ...base, channel: "other" }), true);
    assert.equal(hasStructuralChange(schema, base, { ...base, providers: ["a"] }), true);
  });
});
