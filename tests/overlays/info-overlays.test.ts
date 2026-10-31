import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createTwitchEmote } from "../../src/shared/emotes/emote.ts";
import type { MessageFragment } from "../../src/shared/emotes/fragments.ts";
import { parseStats } from "../../src/shared/stats.ts";
import { goalKindForSection, goalProgress, goalState, readGoalConfig, readGoalKind } from "../../src/overlays/goal/goal-config.ts";
import { readRecentConfig, recentTypeForSection } from "../../src/overlays/recent/recent-config.ts";
import { EmoteCounter } from "../../src/overlays/topemotes/emote-counter.ts";

// Helpers
function fragments(...names: string[]): MessageFragment[] {
  return names.map((name) =>
    name.startsWith(":") ? { kind: "text", text: name } : { kind: "emote", emote: createTwitchEmote(name, name), overlays: [] },
  );
}

// Tests
describe("stream stats", () => {
  test("parse counts and recent events", () => {
    const stats = parseStats({
      followers: 120,
      subscribers: 4,
      subPoints: -1,
      recent: {
        follow: [{ userName: "Fan" }, { userName: "" }, "broken"],
        sub: [{ userName: "Sub", amount: 3, tier: "prime" }],
        host: [{ userName: "Old" }],
      },
    });
    assert.equal(stats.followers, 120);
    assert.equal(stats.subPoints, null);
    assert.deepEqual(
      stats.recent.get("follow")?.map((entry) => entry.userName),
      ["Fan"],
    );
    assert.equal(stats.recent.get("sub")?.[0]?.tier, "prime");
    assert.equal(stats.recent.size, 2);
    assert.equal(parseStats(null).followers, null);
  });
});

describe("goals", () => {
  test("pick the counter and limit the progress", () => {
    const stats = parseStats({ followers: 150, subscribers: 3, subPoints: 8 });
    const config = readGoalConfig({ followersTarget: 100, subsTarget: 10, subsCount: "points" });
    const followers = goalState(config, "followers", stats);
    assert.deepEqual(followers, { title: "Follower goal", current: 150, target: 100 });
    assert.equal(followers === null ? null : goalProgress(followers), 1);
    const subs = goalState(config, "subs", stats);
    assert.equal(subs === null ? null : goalProgress(subs), 0.8);
    const empty = goalState(config, "subs", parseStats(null));
    assert.equal(empty === null ? null : goalProgress(empty), 0);
    assert.equal(readGoalKind("subs"), "subs");
    assert.equal(readGoalKind("anything"), "followers");
    assert.equal(goalKindForSection("goal.subs"), "subs");
  });

  test("use the active Twitch goal of the matching type", () => {
    const stats = parseStats({
      followers: 150,
      goals: [
        { id: "a", type: "new_subscription_count", description: "", current: 3, target: 10 },
        { id: "b", type: "follower", description: "Road to 500", current: 420, target: 500 },
        { id: "c", type: "follower", current: 1, target: 0 },
      ],
    });
    assert.equal(stats.goals.length, 2);
    const config = readGoalConfig({ followersSource: "twitch", subsSource: "twitch", subsTitle: "Subs" });
    assert.deepEqual(goalState(config, "followers", stats), { title: "Road to 500", current: 420, target: 500 });
    assert.deepEqual(goalState(config, "subs", stats), { title: "Subs", current: 3, target: 10 });
    assert.equal(goalState(config, "subs", parseStats({ goals: [] })), null);
    assert.deepEqual(goalState(readGoalConfig({}), "followers", stats)?.current, 150);
  });
});

describe("recent events", () => {
  test("have settings per type", () => {
    const config = readRecentConfig({ cheerCount: 25, followTitle: "" });
    assert.equal(config.cheerCount, 10);
    assert.equal(config.followTitle, "");
    assert.equal(config.subItem, "{name} ({tier})");
    assert.equal(recentTypeForSection("recent.gift"), "gift");
    assert.equal(recentTypeForSection("section.general"), "follow");
  });
});

describe("EmoteCounter", () => {
  test("counts every emote once per message", () => {
    const counter = new EmoteCounter();
    counter.add(fragments("Kappa", ":", "Kappa", "LUL"), 1000);
    counter.add(fragments("LUL"), 2000);
    counter.add(fragments("LUL", "PogChamp"), 3000);
    assert.deepEqual(
      counter.top(2, 0, 4000).map(({ emote, count }) => [emote.name, count]),
      [
        ["LUL", 3],
        ["PogChamp", 1],
      ],
    );
  });

  test("forgets uses outside the time window", () => {
    const counter = new EmoteCounter();
    counter.add(fragments("Kappa"), 1000);
    counter.add(fragments("LUL"), 50_000);
    assert.deepEqual(
      counter.top(5, 30_000, 60_000).map(({ emote }) => emote.name),
      ["LUL"],
    );
    assert.equal(counter.size, 1);
  });
});
