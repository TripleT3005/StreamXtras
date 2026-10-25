import { bttvProvider } from "../../shared/emotes/bttv.ts";
import type { EmoteProvider } from "../../shared/emotes/emote.ts";
import { EmoteLibrary } from "../../shared/emotes/emote-library.ts";
import { ffzProvider } from "../../shared/emotes/ffz.ts";
import { buildFragments } from "../../shared/emotes/fragments.ts";
import { sevenTvProvider } from "../../shared/emotes/seven-tv.ts";
import type { ChatMessageEvent, OverlayEvent } from "../../shared/events.ts";
import { BadgeLibrary } from "../../shared/twitch/badge-library.ts";
import { TwitchChatSource } from "../../shared/twitch/twitch-chat-source.ts";
import { UserLibrary } from "../../shared/twitch/user-library.ts";
import type { ChatboxConfig } from "./chatbox-config.ts";
import { ChatList } from "./chat-list.ts";
import { renderMessage, type MessageContext } from "./message-view.ts";

// Constants
const emoteRefreshIntervalMs = 10 * 60_000;
const emoteProviders: readonly EmoteProvider[] = [sevenTvProvider, bttvProvider, ffzProvider];

// Chat box
export class Chatbox {
  #config: ChatboxConfig;
  readonly #chatList: ChatList;
  readonly #emotes: EmoteLibrary;
  readonly #source: TwitchChatSource;
  readonly #badges = new BadgeLibrary();
  readonly #context: MessageContext = { badges: this.#badges, avatars: new UserLibrary() };
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
        this.#addMessage(event);
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
          void this.#badges.loadGlobal();
          void this.#badges.loadChannel(event.channelId);
        }
        break;
      case "connection.state":
        console.info(`Chat connection: ${event.state}`);
        break;
    }
  }

  #addMessage(message: ChatMessageEvent): void {
    const isPartnerMessage = message.sourceChannelId !== null && message.sourceChannelId !== message.channelId;
    if (isPartnerMessage && !this.#config.showPartnerMessages) {
      return;
    }
    if (message.sourceChannelId !== null) {
      void this.#badges.loadChannel(message.sourceChannelId);
    }
    const fragments = buildFragments(message.text, message.emotes, this.#emotes);
    this.#chatList.add(renderMessage(message, fragments, this.#config, this.#context));
  }

  #refreshEmotes(): void {
    if (this.#channelId === null) {
      return;
    }
    void this.#emotes.load(this.#channelId).then(() => console.info(`Loaded ${this.#emotes.size} third-party emotes`));
  }
}
