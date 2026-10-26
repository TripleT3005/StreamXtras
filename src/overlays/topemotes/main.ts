import { applyAppearance } from "../../shared/appearance.ts";
import { fetchOverlaySettings, subscribeToSettings } from "../../shared/config.ts";
import { bttvProvider } from "../../shared/emotes/bttv.ts";
import { createTwitchEmote, type EmoteProvider } from "../../shared/emotes/emote.ts";
import { EmoteLibrary } from "../../shared/emotes/emote-library.ts";
import { ffzProvider } from "../../shared/emotes/ffz.ts";
import { buildFragments } from "../../shared/emotes/fragments.ts";
import { sevenTvProvider } from "../../shared/emotes/seven-tv.ts";
import { isRecord } from "../../shared/json.ts";
import { onPreviewMessage, previewSettingsMessage } from "../../shared/preview-messages.ts";
import { hasStructuralChange } from "../../shared/settings.ts";
import { normalizeChannel, TwitchChatSource } from "../../shared/twitch/twitch-chat-source.ts";
import { EmoteCounter, type EmoteCount } from "./emote-counter.ts";
import { readTopEmotesConfig, topEmotesOverlayId, topEmotesSettings, type TopEmotesConfig } from "./topemotes-config.ts";

// Constants
const renderIntervalMs = 2000;
const emoteRefreshIntervalMs = 10 * 60_000;
const emoteProviders: readonly EmoteProvider[] = [sevenTvProvider, bttvProvider, ffzProvider];
const demoEmotes: readonly EmoteCount[] = [
  { emote: createTwitchEmote("25", "Kappa"), count: 42 },
  { emote: createTwitchEmote("425618", "LUL"), count: 31 },
  { emote: createTwitchEmote("41", "Kreygasm"), count: 17 },
  { emote: createTwitchEmote("64138", "SeemsGood"), count: 9 },
  { emote: createTwitchEmote("354", "4Head"), count: 6 },
  { emote: createTwitchEmote("28087", "WutFace"), count: 4 },
  { emote: createTwitchEmote("58765", "NotLikeThis"), count: 3 },
  { emote: createTwitchEmote("1902", "Keepo"), count: 2 },
  { emote: createTwitchEmote("245", "ResidentSleeper"), count: 2 },
  { emote: createTwitchEmote("30259", "HeyGuys"), count: 1 },
];

// Rendering
function render(root: HTMLElement, config: TopEmotesConfig, counts: readonly EmoteCount[]): void {
  applyAppearance(root, config);
  root.dataset["layout"] = config.layout;
  root.style.setProperty("--emote-size", `${config.emoteSize}px`);
  const title = document.getElementById("top-title");
  const list = document.getElementById("top-list");
  if (title === null || list === null) {
    return;
  }
  title.textContent = config.title;
  title.hidden = config.title === "";
  list.replaceChildren(
    ...counts.slice(0, config.count).map(({ emote, count }) => {
      const item = document.createElement("li");
      const image = document.createElement("img");
      image.src = emote.url;
      image.alt = emote.name;
      image.title = emote.name;
      image.referrerPolicy = "no-referrer";
      item.append(image);
      if (config.showCounts) {
        const label = document.createElement("span");
        label.className = "count";
        label.textContent = `${count}×`;
        item.append(label);
      }
      return item;
    }),
  );
}

// Startup
async function start(): Promise<void> {
  const root = document.documentElement;
  const urlValues = Object.fromEntries(new URLSearchParams(location.search));

  if (urlValues["preview"] !== undefined) {
    render(root, readTopEmotesConfig({}), demoEmotes);
    onPreviewMessage(previewSettingsMessage, (data) => {
      if (isRecord(data["settings"])) {
        render(root, readTopEmotesConfig(data["settings"]), demoEmotes);
      }
    });
    return;
  }

  let config = readTopEmotesConfig({ ...(await fetchOverlaySettings(topEmotesOverlayId)), ...urlValues });
  const counter = new EmoteCounter();
  const update = (): void => render(root, config, counter.top(config.count, config.windowMinutes * 60_000, Date.now()));
  update();
  subscribeToSettings(topEmotesOverlayId, (stored) => {
    const next = readTopEmotesConfig({ ...stored, ...urlValues });
    if (hasStructuralChange(topEmotesSettings, config, next)) {
      location.reload();
      return;
    }
    config = next;
    update();
  });

  const channel = normalizeChannel(config.channel);
  if (channel === null) {
    return;
  }
  const emotes = new EmoteLibrary(emoteProviders.filter((provider) => config.emoteProviders.includes(provider.name)));
  const source = new TwitchChatSource({ channel });
  let channelId: string | null = null;
  source.subscribe((event) => {
    if (event.type === "chat.message") {
      counter.add(buildFragments(event.text, event.emotes, emotes), Date.now());
    } else if (event.type === "channel.joined" && channelId !== event.channelId) {
      channelId = event.channelId;
      void emotes.load(event.channelId);
    }
  });
  source.start();
  setInterval(update, renderIntervalMs);
  setInterval(() => {
    if (channelId !== null) {
      void emotes.load(channelId);
    }
  }, emoteRefreshIntervalMs);
}

void start();
