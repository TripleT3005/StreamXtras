import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BadgeLibrary, parseBadgeSets } from "../../../src/shared/twitch/badge-library.ts";
import { UserLibrary } from "../../../src/shared/twitch/user-library.ts";

const globalBadges = {
  subscriber: { "0": { url: "https://cdn/global-sub", title: "Subscriber" } },
  "hype-train": { "1": { url: "https://cdn/hype", title: "Current Hype Train Conductor" } },
};
const channelBadges = {
  subscriber: { "12": { url: "https://cdn/channel-sub-12", title: "1-Year Subscriber" } },
};

function loader(responses: Readonly<Record<string, unknown>>, requests: string[] = []) {
  return async (url: string): Promise<unknown> => {
    requests.push(url);
    if (!(url in responses)) {
      throw new Error("HTTP 503");
    }
    return responses[url];
  };
}

describe("parseBadgeSets", () => {
  test("keeps valid HTTPS badges and skips broken entries", () => {
    const sets = parseBadgeSets({
      moderator: { "1": { url: "https://cdn/mod", title: "Moderator" }, "2": { url: "javascript:alert(1)" }, "3": "x" },
      broken: 5,
    });
    assert.ok(sets);
    assert.deepEqual([...(sets.get("moderator") ?? new Map())], [["1", { url: "https://cdn/mod", title: "Moderator" }]]);
    assert.equal(sets.has("broken"), false);
    assert.equal(parseBadgeSets(null), null);
  });
});

describe("BadgeLibrary", () => {
  test("prefers channel badges over global and built-in badges", async () => {
    const library = new BadgeLibrary(
      loader({ "/api/twitch/badges/global": globalBadges, "/api/twitch/badges/channel/42": channelBadges }),
    );
    await library.loadGlobal();
    await library.loadChannel("42");
    assert.equal(library.resolve({ set: "subscriber", version: "12" }, "42")?.url, "https://cdn/channel-sub-12");
    assert.equal(library.resolve({ set: "subscriber", version: "0" }, "42")?.url, "https://cdn/global-sub");
    assert.equal(library.resolve({ set: "hype-train", version: "1" }, "99")?.title, "Current Hype Train Conductor");
    assert.equal(library.resolve({ set: "unknown", version: "1" }, "42"), null);
  });

  test("falls back to built-in badges when not logged in and does not retry immediately", async () => {
    const requests: string[] = [];
    const library = new BadgeLibrary(loader({}, requests));
    await library.loadGlobal();
    await library.loadGlobal();
    assert.equal(requests.length, 1);
    const moderator = library.resolve({ set: "moderator", version: "1" }, null);
    assert.equal(moderator?.url, "https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/2");
  });

  test("loads each channel only once", async () => {
    const requests: string[] = [];
    const library = new BadgeLibrary(loader({ "/api/twitch/badges/channel/7": channelBadges }, requests));
    await Promise.all([library.loadChannel("7"), library.loadChannel("7")]);
    await library.loadChannel("7");
    assert.deepEqual(requests, ["/api/twitch/badges/channel/7"]);
  });
});

describe("UserLibrary", () => {
  test("caches avatars and ignores invalid answers", async () => {
    const requests: string[] = [];
    const library = new UserLibrary(
      loader(
        {
          "/api/twitch/users/1": { profileImageUrl: "https://cdn/avatar.png" },
          "/api/twitch/users/2": { profileImageUrl: "http://insecure" },
        },
        requests,
      ),
    );
    assert.equal(await library.avatar("1"), "https://cdn/avatar.png");
    assert.equal(await library.avatar("1"), "https://cdn/avatar.png");
    assert.equal(await library.avatar("2"), null);
    assert.equal(await library.avatar("3"), null);
    assert.deepEqual(requests, ["/api/twitch/users/1", "/api/twitch/users/2", "/api/twitch/users/3"]);
  });
});
