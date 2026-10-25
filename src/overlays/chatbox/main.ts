import { loadOverlaySettings, subscribeToSettings } from "../../shared/config.ts";
import { bttvProvider } from "../../shared/emotes/bttv.ts";
import type { EmoteProvider } from "../../shared/emotes/emote.ts";
import { EmoteLibrary } from "../../shared/emotes/emote-library.ts";
import { ffzProvider } from "../../shared/emotes/ffz.ts";
import { buildFragments } from "../../shared/emotes/fragments.ts";
import { sevenTvProvider } from "../../shared/emotes/seven-tv.ts";
import type { OverlayEvent } from "../../shared/events.ts";
import { normalizeChannel, TwitchChatSource } from "../../shared/twitch/twitch-chat-source.ts";
import { readChatboxConfig, type ChatboxConfig } from "./chatbox-config.ts";
import { ChatList } from "./chat-list.ts";
import { renderMessage } from "./message-view.ts";

// Constants
const overlayId = "chatbox";
const emoteRefreshIntervalMs = 10 * 60_000;
const emoteProviders: readonly EmoteProvider[] = [sevenTvProvider, bttvProvider, ffzProvider];

// Chat box
class Chatbox {
  readonly #config: ChatboxConfig;
  readonly #chatList: ChatList;
  readonly #emotes: EmoteLibrary;
  #channelId: string | null = null;

  constructor(config: ChatboxConfig, container: HTMLElement) {
    this.#config = config;
    this.#chatList = new ChatList(container, config.maxMessages);
    this.#emotes = new EmoteLibrary(emoteProviders.filter((provider) => config.emoteProviders.includes(provider.name)));
  }

  start(): void {
    const source = new TwitchChatSource({ channel: this.#config.channel });
    source.subscribe((event) => this.#handleEvent(event));
    source.start();
    setInterval(() => this.#refreshEmotes(), emoteRefreshIntervalMs);
  }

  #handleEvent(event: OverlayEvent): void {
    switch (event.type) {
      case "chat.message":
        this.#chatList.add(renderMessage(event, buildFragments(event.text, event.emotes, this.#emotes), this.#config));
        break;
      case "chat.delete":
        this.#chatList.remove(event.messageId);
        break;
      case "chat.clear":
        this.#chatList.clear(event.userId);
        break;
      case "channel.joined":
        if (this.#channelId !== event.channelId) {
          this.#channelId = event.channelId;
          this.#refreshEmotes();
        }
        break;
      case "connection.state":
        console.info(`Chat connection: ${event.state}`);
        break;
    }
  }

  #refreshEmotes(): void {
    if (this.#channelId === null) {
      return;
    }
    void this.#emotes.load(this.#channelId).then(() => console.info(`Loaded ${this.#emotes.size} third-party emotes`));
  }
}

// Startup
async function start(): Promise<void> {
  const container = document.getElementById("messages");
  const status = document.getElementById("status");
  if (container === null || status === null) {
    return;
  }

  subscribeToSettings(overlayId, () => location.reload());
  const config = readChatboxConfig(await loadOverlaySettings(overlayId, location.search));
  if (normalizeChannel(config.channel) === null) {
    status.textContent = "No valid channel configured. Open the settings from the tray icon and enter your channel.";
    status.hidden = false;
    return;
  }

  new Chatbox(config, container).start();
}

void start();
