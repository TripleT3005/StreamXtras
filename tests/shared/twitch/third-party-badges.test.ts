import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  parseBttvBadges,
  parseChatterinoBadges,
  parseFfzBadges,
  parseSevenTvUserBadge,
  ThirdPartyBadgeLibrary,
} from "../../../src/shared/twitch/third-party-badges.ts";

// Fixtures
const bttv = [
  { providerId: "11", badge: { description: "NightDev Developer", svg: "https://cdn.betterttv.net/badges/developer.svg" } },
  { providerId: "12", badge: { description: "Evil", svg: "javascript:alert(1)" } },
  "broken",
];
const ffz = {
  badges: [
    { id: 2, title: "Bot", urls: { "1": "https://cdn.frankerfacez.com/badge/2/1", "2": "https://cdn.frankerfacez.com/badge/2/2" } },
    { id: 3, title: "FFZ Supporter", urls: { "1": "https://cdn.frankerfacez.com/badge/3/1" } },
  ],
  users: { "2": [21], "3": [21, 22], "9": [23] },
};
const chatterino = {
  badges: [{ tooltip: "Chatterino Contributor", image1: "https://fourtf.com/1.png", image2: "https://fourtf.com/2.png", users: ["31"] }],
};
const sevenTvUser = { user: { style: { badge_id: "01JJJ74CRHZBRMCM8F4Y2WBN6R" } } };

// Tests
describe("third-party badge parsing", () => {
  test("reads BetterTTV badges and skips unsafe URLs", () => {
    const badges = parseBttvBadges(bttv);
    assert.deepEqual(badges.get("11"), [{ url: "https://cdn.betterttv.net/badges/developer.svg", title: "NightDev Developer" }]);
    assert.equal(badges.has("12"), false);
  });

  test("reads FrankerFaceZ badges per user", () => {
    const badges = parseFfzBadges(ffz);
    assert.deepEqual(
      badges.get("21")?.map((badge) => badge.title),
      ["Bot", "FFZ Supporter"],
    );
    assert.equal(badges.get("21")?.[0]?.url, "https://cdn.frankerfacez.com/badge/2/2");
    assert.equal(badges.get("22")?.[0]?.url, "https://cdn.frankerfacez.com/badge/3/1");
    assert.equal(badges.has("23"), false);
    assert.equal(parseFfzBadges(null).size, 0);
  });

  test("reads Chatterino badges", () => {
    assert.deepEqual(parseChatterinoBadges(chatterino).get("31"), [{ url: "https://fourtf.com/2.png", title: "Chatterino Contributor" }]);
  });

  test("reads the 7TV badge of a user", () => {
    assert.deepEqual(parseSevenTvUserBadge(sevenTvUser), {
      url: "https://cdn.7tv.app/badge/01JJJ74CRHZBRMCM8F4Y2WBN6R/2x.webp",
      title: "7TV",
    });
    assert.equal(parseSevenTvUserBadge({ user: { style: { badge_id: "../x" } } }), null);
    assert.equal(parseSevenTvUserBadge({ user: { style: {} } }), null);
    assert.equal(parseSevenTvUserBadge(null), null);
  });
});

describe("ThirdPartyBadgeLibrary", () => {
  test("loads only the chosen lists", async () => {
    const requests: string[] = [];
    const library = new ThirdPartyBadgeLibrary(["bttv", "chatterino"], async (url) => {
      requests.push(url);
      return url.includes("betterttv") ? bttv : chatterino;
    });
    await library.load();
    assert.equal(requests.length, 2);
    assert.equal(library.badgesFor("11").length, 1);
    assert.equal(library.badgesFor("31").length, 1);
    assert.equal(library.badgesFor("21").length, 0);
  });

  test("looks up 7TV badges once per user and reports them", async () => {
    const requests: string[] = [];
    const library = new ThirdPartyBadgeLibrary(["7tv"], async (url) => {
      requests.push(url);
      return url.endsWith("/42") ? sevenTvUser : null;
    });
    const changed: string[] = [];
    library.onChange((userId) => changed.push(userId));
    assert.deepEqual(library.badgesFor("42"), []);
    assert.deepEqual(library.badgesFor("42"), []);
    library.badgesFor("43");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(requests, ["https://7tv.io/v3/users/twitch/42", "https://7tv.io/v3/users/twitch/43"]);
    assert.deepEqual(changed, ["42"]);
    assert.equal(library.badgesFor("42")[0]?.title, "7TV");
    assert.equal(library.badgesFor("43").length, 0);
  });
});
