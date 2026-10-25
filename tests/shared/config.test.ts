import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readBoolean, readColor, readInteger, readString, readStringList } from "../../src/shared/config.ts";

describe("config readers", () => {
  test("reads strings and falls back for other types", () => {
    assert.equal(readString({ channel: "  name " }, "channel", ""), "name");
    assert.equal(readString({ channel: 5 }, "channel", "fallback"), "fallback");
  });

  test("reads integers from numbers and URL strings within bounds", () => {
    assert.equal(readInteger({ value: 20 }, "value", 30, 1, 200), 20);
    assert.equal(readInteger({ value: "50" }, "value", 30, 1, 200), 50);
    assert.equal(readInteger({ value: 500 }, "value", 30, 1, 200), 200);
    assert.equal(readInteger({ value: "abc" }, "value", 30, 1, 200), 30);
    assert.equal(readInteger({ value: 1.5 }, "value", 30, 1, 200), 30);
    assert.equal(readInteger({ value: "" }, "value", 30, 1, 200), 30);
  });

  test("reads booleans from JSON and URL values", () => {
    assert.equal(readBoolean({ value: false }, "value", true), false);
    assert.equal(readBoolean({ value: "true" }, "value", false), true);
    assert.equal(readBoolean({ value: "0" }, "value", true), false);
    assert.equal(readBoolean({ value: "maybe" }, "value", true), true);
  });

  test("reads string lists from arrays and comma separated values", () => {
    assert.deepEqual(readStringList({ value: ["a", " b ", 3, ""] }, "value", []), ["a", "b"]);
    assert.deepEqual(readStringList({ value: "a, b,,c" }, "value", []), ["a", "b", "c"]);
    assert.deepEqual(readStringList({}, "value", ["x"]), ["x"]);
  });

  test("reads hex colors with optional alpha", () => {
    assert.equal(readColor({ value: "#AbCdEf" }, "value", "#000000"), "#abcdef");
    assert.equal(readColor({ value: "#11223344" }, "value", "#000000"), "#11223344");
    assert.equal(readColor({ value: "#123" }, "value", "#000000"), "#000000");
    assert.equal(readColor({ value: 5 }, "value", "#000000"), "#000000");
  });
});
