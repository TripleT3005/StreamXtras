import { bttvProvider } from "../../shared/emotes/bttv.ts";
import type { EmoteProvider } from "../../shared/emotes/emote.ts";
import { EmoteLibrary } from "../../shared/emotes/emote-library.ts";
import { ffzProvider } from "../../shared/emotes/ffz.ts";
import { buildFragments } from "../../shared/emotes/fragments.ts";
import { sevenTvProvider } from "../../shared/emotes/seven-tv.ts";
import type { OverlayEvent } from "../../shared/events.ts";
import { TwitchChatSource } from "../../shared/twitch/twitch-chat-source.ts";
import type { ChatboxConfig } from "./chatbox-config.ts";
import { ChatList } from "./chat-list.ts";
import { renderMessage } from "./message-view.ts";

// Constants
const emoteRefreshIntervalMs = 10 * 60_000;
const emoteProviders: readonly EmoteProvider[] = [sevenTvProvider, bttvProvider, ffzProvider];

// Chat box
export class Chatbox {
  #config: ChatboxConfig;
  readonly #chatList: ChatList;
  readonly #emotes: EmoteLibrary;
  readonly #source: TwitchChatSource;
  #channelId: string | null = null;
  #refreshTimer: ReturnType<typeof setInterval> | undefined;

  constructor(config: ChatboxConfig, container: HTMLElement) {
    this.#config = config;
    this.#chatList = new ChatList(container, config.maxMessages, config.hideAfterSeconds);
    this.#emotes = new EmoteLibrary(emoteProviders.filter((provider) => config.emoteProviders.includes(provider.name)));
    this.#source = new TwitchChatSource({ channel: config.channel });
    this.#source.subscribe((event) => this.#handleEvent(event));
  }

  start(): void {
    this.#source.start();
    this.#refreshTimer = setInterval(() => this.#refreshEmotes(), emoteRefreshIntervalMs);
  }

  stop(): void {
    this.#source.stop();
    clearInterval(this.#refreshTimer);
  }

  configure(config: ChatboxConfig): void {
    this.#config = config;
    this.#chatList.configure(config.maxMessages, config.hideAfterSeconds);
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
