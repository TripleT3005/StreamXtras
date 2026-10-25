import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Emote, EmoteProvider, ThirdPartyEmoteProviderName } from "../../../src/shared/emotes/emote.ts";
import { EmoteLibrary } from "../../../src/shared/emotes/emote-library.ts";

function emote(name: string, provider: ThirdPartyEmoteProviderName, tag: string): Emote {
  return { name, provider, url: `${provider}/${tag}`, zeroWidth: false };
}

function fakeProvider(
  name: ThirdPartyEmoteProviderName,
  global: readonly Emote[],
  channel: readonly Emote[] | Error,
  calls: string[] = [],
): EmoteProvider {
  return {
    name,
    async loadGlobal() {
      calls.push(`${name}:global`);
      return global;
    },
    async loadChannel(channelId: string) {
      calls.push(`${name}:${channelId}`);
      if (channel instanceof Error) {
        throw channel;
      }
      return channel;
    },
  };
}

describe("EmoteLibrary", () => {
  test("prefers channel over global and 7TV over BTTV over FFZ", async () => {
    const library = new EmoteLibrary([
      fakeProvider("7tv", [emote("Same", "7tv", "global")], [emote("Channel", "7tv", "channel")]),
      fakeProvider("ffz", [emote("Same", "ffz", "global"), emote("OnlyFfz", "ffz", "global")], [emote("Channel", "ffz", "channel")]),
      fakeProvider("bttv", [emote("Same", "bttv", "global")], [emote("Global7", "bttv", "channel")]),
    ]);
    await library.load("1");
    assert.equal(library.get("Same")?.url, "7tv/global");
    assert.equal(library.get("Channel")?.url, "7tv/channel");
    assert.equal(library.get("OnlyFfz")?.url, "ffz/global");
    assert.equal(library.get("Global7")?.url, "bttv/channel");
    assert.equal(library.get("Missing"), undefined);
  });

  test("keeps working when a provider fails and loads global emotes only once", async () => {
    const calls: string[] = [];
    const library = new EmoteLibrary([fakeProvider("bttv", [emote("Global", "bttv", "g")], new Error("offline"), calls)]);
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      await library.load("1");
      await library.load("1");
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(library.get("Global")?.url, "bttv/g");
    assert.deepEqual(calls, ["bttv:global", "bttv:1", "bttv:1"]);
  });

  test("drops channel emotes of a previous channel", async () => {
    let channelEmotes: readonly Emote[] = [emote("Old", "7tv", "old")];
    const provider: EmoteProvider = {
      name: "7tv",
      loadGlobal: async () => [],
      loadChannel: async () => channelEmotes,
    };
    const library = new EmoteLibrary([provider]);
    await library.load("1");
    channelEmotes = [emote("New", "7tv", "new")];
    await library.load("2");
    assert.equal(library.get("Old"), undefined);
    assert.equal(library.get("New")?.url, "7tv/new");
  });
});
