import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getGlobalBadgeUrl } from "../../../src/shared/twitch/badges.ts";

describe("getGlobalBadgeUrl", () => {
  test("returns the image of known global badges for every version", () => {
    assert.equal(
      getGlobalBadgeUrl({ set: "moderator", version: "1" }),
      "https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/2",
    );
    assert.equal(getGlobalBadgeUrl({ set: "subscriber", version: "3012" }), getGlobalBadgeUrl({ set: "subscriber", version: "0" }));
  });

  test("returns null for unknown badges and prototype keys", () => {
    assert.equal(getGlobalBadgeUrl({ set: "bits", version: "100" }), null);
    assert.equal(getGlobalBadgeUrl({ set: "constructor", version: "1" }), null);
  });
});
