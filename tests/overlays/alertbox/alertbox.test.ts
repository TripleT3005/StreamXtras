import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatAlertText, parseAlert } from "../../../src/overlays/alertbox/alert.ts";
import { AlertQueue } from "../../../src/overlays/alertbox/alert-queue.ts";
import { alertStyle, readAlertboxConfig } from "../../../src/overlays/alertbox/alertbox-config.ts";
import { mediaUrl, readMediaReference } from "../../../src/shared/config.ts";

describe("alerts", () => {
  test("parses follow alerts from the companion app", () => {
    assert.deepEqual(parseAlert({ type: "follow", userName: "NewFollower", userLogin: "newfollower", test: false }), {
      type: "follow",
      userName: "NewFollower",
      test: false,
    });
    assert.equal(parseAlert({ type: "follow", userName: "" }), null);
    assert.equal(parseAlert({ type: "raid", userName: "Raider" }), null);
    assert.equal(parseAlert("follow"), null);
  });

  test("splits the text template around the name", () => {
    assert.deepEqual(formatAlertText("{name} is now following!", "Fan"), [
      { kind: "name", text: "Fan" },
      { kind: "text", text: " is now following!" },
    ]);
    assert.deepEqual(formatAlertText("Welcome {name}, thanks {name}!", "Fan"), [
      { kind: "text", text: "Welcome " },
      { kind: "name", text: "Fan" },
      { kind: "text", text: ", thanks " },
      { kind: "name", text: "Fan" },
      { kind: "text", text: "!" },
    ]);
    assert.deepEqual(formatAlertText("New follower", "Fan"), [{ kind: "text", text: "New follower" }]);
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
  test("ship with the included image and sound", () => {
    const config = readAlertboxConfig({});
    assert.deepEqual(alertStyle(config, "follow"), {
      enabled: true,
      text: "{name} is now following!",
      image: "assets/images/heart.svg",
      sound: "assets/sounds/chime.wav",
      durationMs: 6000,
    });
  });

  test("accept only included or uploaded media", () => {
    assert.equal(readMediaReference({ value: "media/my-sound-123.mp3" }, "value", "x"), "media/my-sound-123.mp3");
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
  });
});
