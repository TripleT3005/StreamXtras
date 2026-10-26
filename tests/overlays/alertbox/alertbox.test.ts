import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatAlertText, parseAlert, plainAlertText, type OverlayAlert } from "../../../src/shared/alerts.ts";
import { AlertQueue } from "../../../src/overlays/alertbox/alert-queue.ts";
import { alertSpeech, alertStyle, alertTypeForSection, readAlertboxConfig, variantMatches } from "../../../src/overlays/alertbox/alertbox-config.ts";
import { isVideoReference, mediaUrl, readMediaReference } from "../../../src/shared/config.ts";

// Helpers
function alert(overrides: Partial<OverlayAlert>): OverlayAlert {
  return { type: "follow", userName: "Fan", userLogin: "fan", amount: 0, tier: null, message: "", avatarUrl: null, test: false, ...overrides };
}

const variant = {
  match: "exact",
  value: "67",
  text: "Six seven, {name}!",
  image: "media/clip-1.webm",
  avatar: false,
  sound: "",
  duration: 10,
} as const;

// Tests
describe("alerts", () => {
  test("parses alerts from the companion app", () => {
    assert.deepEqual(parseAlert({ type: "follow", userName: "NewFollower", userLogin: "newfollower", test: false }), {
      type: "follow",
      userName: "NewFollower",
      userLogin: "newfollower",
      amount: 0,
      tier: null,
      message: "",
      avatarUrl: null,
      test: false,
    });
    const sub = parseAlert({ type: "sub", userName: "Fan", amount: 3, tier: "prime", message: " Hi! " });
    assert.equal(sub?.tier, "prime");
    assert.equal(sub?.message, "Hi!");
    assert.equal(parseAlert({ type: "sub", userName: "Fan", tier: "4", message: 5 })?.tier, null);
    assert.deepEqual(parseAlert({ type: "cheer", userName: "Anonymous", amount: 67 })?.amount, 67);
    assert.equal(parseAlert({ type: "follow", userName: "" }), null);
    assert.equal(parseAlert({ type: "host", userName: "Raider" }), null);
    assert.equal(parseAlert("follow"), null);
    assert.equal(parseAlert({ type: "gift", userName: "Fan", amount: -3 })?.amount, 0);
  });

  test("accepts only Twitch profile pictures", () => {
    const twitch = "https://static-cdn.jtvnw.net/user/abc-profile_image-300x300.png";
    assert.equal(parseAlert({ type: "raid", userName: "Raider", avatarUrl: twitch })?.avatarUrl, twitch);
    for (const avatarUrl of ["https://evil.example/a.png", "javascript:alert(1)", "//static-cdn.jtvnw.net/a.png", 5]) {
      assert.equal(parseAlert({ type: "raid", userName: "Raider", avatarUrl })?.avatarUrl, null);
    }
  });

  test("replaces name and amount in the text template", () => {
    const texts = { tier: null, message: "" } as const;
    assert.deepEqual(formatAlertText("{name} is now following!", { ...texts, userName: "Fan", amount: 0 }), [
      { kind: "highlight", text: "Fan" },
      { kind: "text", text: " is now following!" },
    ]);
    assert.deepEqual(formatAlertText("Thanks {name} for {amount} bits, {name}!", { ...texts, userName: "Fan", amount: 67 }), [
      { kind: "text", text: "Thanks " },
      { kind: "highlight", text: "Fan" },
      { kind: "text", text: " for " },
      { kind: "highlight", text: "67" },
      { kind: "text", text: " bits, " },
      { kind: "highlight", text: "Fan" },
      { kind: "text", text: "!" },
    ]);
    assert.deepEqual(formatAlertText("New follower {nam}", { ...texts, userName: "Fan", amount: 0 }), [{ kind: "text", text: "New follower {nam}" }]);
    assert.deepEqual(formatAlertText("{tier}: {message}", { userName: "Fan", amount: 1, tier: "2", message: "<b>Hi</b>" }), [
      { kind: "highlight", text: "Tier 2" },
      { kind: "text", text: ": " },
      { kind: "text", text: "<b>Hi</b>" },
    ]);
    assert.equal(plainAlertText("{name} says {message}", { userName: "Fan", amount: 0, tier: "prime", message: "" }), "Fan says");
  });
});

describe("AlertQueue", () => {
  test("shows alerts one after another in order", async () => {
    const shown: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const finished = new Promise<void>((resolve) => {
      const queue = new AlertQueue<string>(async (item) => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((wait) => setTimeout(wait, 5));
        shown.push(item);
        running -= 1;
        if (shown.length === 3) {
          resolve();
        }
      });
      queue.enqueue("a");
      queue.enqueue("b");
      queue.enqueue("c");
    });
    await finished;
    assert.deepEqual(shown, ["a", "b", "c"]);
    assert.equal(maxRunning, 1);
  });

  test("keeps going after a failing alert and limits the queue", async () => {
    const shown: number[] = [];
    let release: () => void = () => {};
    const blocker = new Promise<void>((resolve) => (release = resolve));
    const queue = new AlertQueue<number>(async (item) => {
      if (item === 0) {
        await blocker;
        throw new Error("broken");
      }
      shown.push(item);
    });
    for (let item = 0; item < 60; item++) {
      queue.enqueue(item);
    }
    assert.equal(queue.length, 50);
    release();
    await new Promise((wait) => setTimeout(wait, 20));
    assert.equal(shown.length, 50);
    assert.equal(shown[0], 1);
  });
});

describe("alert box settings", () => {
  test("ship with the included images and sounds for every type", () => {
    const config = readAlertboxConfig({});
    assert.deepEqual(alertStyle(config, alert({ type: "follow" })), {
      enabled: true,
      text: "{name} is now following!",
      image: "assets/images/heart.svg",
      avatar: false,
      sound: "assets/sounds/chime.wav",
      durationMs: 6000,
    });
    assert.equal(alertStyle(config, alert({ type: "cheer", amount: 100 })).text, "{name} cheered {amount} bits!");
    assert.equal(alertStyle(config, alert({ type: "raid" })).avatar, true);
  });

  test("keep settings saved by earlier versions", () => {
    const config = readAlertboxConfig({ followEnabled: false, followText: "Hi {name}", followDuration: 9 });
    const style = alertStyle(config, alert({ type: "follow" }));
    assert.equal(style.enabled, false);
    assert.equal(style.text, "Hi {name}");
    assert.equal(style.durationMs, 9000);
  });

  test("use the first matching variant", () => {
    const config = readAlertboxConfig({
      cheerVariants: [variant, { ...variant, match: "min", value: "500", text: "Big cheer!" }, "not a variant"],
    });
    assert.equal(config.cheerVariants.length, 2);
    assert.equal(alertStyle(config, alert({ type: "cheer", amount: 67 })).text, "Six seven, {name}!");
    assert.equal(alertStyle(config, alert({ type: "cheer", amount: 67 })).durationMs, 10000);
    assert.equal(alertStyle(config, alert({ type: "cheer", amount: 1000 })).text, "Big cheer!");
    assert.equal(alertStyle(config, alert({ type: "cheer", amount: 66 })).text, "{name} cheered {amount} bits!");
    assert.equal(alertStyle(config, alert({ type: "gift", amount: 67 })).text, "{name} gifted {amount} subs!");
  });

  test("match variants by amount or Twitch user", () => {
    const friend = { userName: "BestFriend", userLogin: "bestfriend", amount: 3, tier: null };
    assert.equal(variantMatches({ match: "user", value: "@bestfriend" }, friend), true);
    assert.equal(variantMatches({ match: "user", value: "BESTFRIEND " }, friend), true);
    assert.equal(variantMatches({ match: "user", value: "" }, friend), false);
    assert.equal(variantMatches({ match: "user", value: "other" }, friend), false);
    assert.equal(variantMatches({ match: "exact", value: "3" }, friend), true);
    assert.equal(variantMatches({ match: "min", value: "2" }, friend), true);
    assert.equal(variantMatches({ match: "min", value: "4" }, friend), false);
    assert.equal(variantMatches({ match: "exact", value: "bestfriend" }, friend), false);
    assert.equal(variantMatches({ match: "min", value: "-1" }, friend), false);
  });

  test("match variants by tier", () => {
    const facts = { userName: "Fan", userLogin: "fan", amount: 1 };
    assert.equal(variantMatches({ match: "tier", value: "Prime" }, { ...facts, tier: "prime" }), true);
    assert.equal(variantMatches({ match: "tier", value: "Tier 3" }, { ...facts, tier: "3" }), true);
    assert.equal(variantMatches({ match: "tier", value: "3" }, { ...facts, tier: "1" }), false);
    assert.equal(variantMatches({ match: "tier", value: "" }, { ...facts, tier: null }), false);
  });

  test("read aloud only when turned on and above the threshold", () => {
    const config = readAlertboxConfig({
      cheerTts: "both",
      cheerTtsMin: 100,
      subTts: "message",
      subTtsTiers: ["2", "3"],
      giftTts: "text",
      ttsMaxLength: 30,
    });
    const cheer = alert({ type: "cheer", amount: 100, message: "Great stream" });
    assert.equal(alertSpeech(config, cheer, "{name} cheered {amount} bits!"), "Fan cheered 100 bits! Great st");
    assert.equal(alertSpeech(config, { ...cheer, amount: 99 }, "{name} cheered"), "");
    assert.equal(alertSpeech(config, cheer, "{name}: {message}"), "Fan: Great stream");
    assert.equal(alertSpeech(config, alert({ type: "sub", tier: "2", message: "Hi" }), "{name}"), "Hi");
    assert.equal(alertSpeech(config, alert({ type: "sub", tier: "prime", message: "Hi" }), "{name}"), "");
    assert.equal(alertSpeech(config, alert({ type: "gift", amount: 4 }), "{name} gifted {amount}"), "");
    assert.equal(alertSpeech(config, alert({ type: "gift", amount: 5 }), "{name} gifted {amount}"), "Fan gifted 5");
    assert.equal(alertSpeech(readAlertboxConfig({}), cheer, "{name}"), "");
    assert.equal(readAlertboxConfig({ followTts: "message" }).followTts, "off");
  });

  test("map editor sections to alert types", () => {
    assert.equal(alertTypeForSection("Gift subs"), "gift");
    assert.equal(alertTypeForSection("Raid"), "raid");
    assert.equal(alertTypeForSection("General"), "follow");
    assert.equal(alertTypeForSection(null), "follow");
  });

  test("accept only included or uploaded media", () => {
    assert.equal(readMediaReference({ value: "media/my-sound-123.mp3" }, "value", "x"), "media/my-sound-123.mp3");
    assert.equal(readMediaReference({ value: "media/friend-clip-1.webm" }, "value", "x"), "media/friend-clip-1.webm");
    assert.equal(readMediaReference({ value: "assets/images/star.svg" }, "value", "x"), "assets/images/star.svg");
    assert.equal(readMediaReference({ value: "" }, "value", "x"), "");
    for (const invalid of ["https://evil.example/a.mp3", "media/../config.json", "media/a.svg", "javascript:alert(1)", 5]) {
      assert.equal(readMediaReference({ value: invalid }, "value", "fallback"), "fallback");
    }
    assert.equal(mediaUrl("media/a-1.png"), "/media/a-1.png");
    assert.equal(mediaUrl("assets/sounds/chime.wav"), "/assets/sounds/chime.wav");
    assert.equal(mediaUrl(""), null);
    assert.equal(mediaUrl("javascript:alert(1)"), null);
    assert.equal(mediaUrl("//evil.example/a.png"), null);
    assert.equal(isVideoReference("media/clip-1.mp4"), true);
    assert.equal(isVideoReference("media/clip-1.png"), false);
    assert.equal(isVideoReference("https://evil.example/a.mp4"), false);
  });
});
