import { OverlayEventEmitter, type ConnectionState, type OverlayEventListener, type OverlayEventSource } from "../events.ts";
import { mapChatEvent } from "./chat-events.ts";
import { parseIrcMessage, type IrcMessage } from "./irc-message.ts";

// Types
export interface TwitchChatSourceOptions {
  readonly channel: string;
  readonly url?: string;
}

// Constants
const defaultUrl = "wss://irc-ws.chat.twitch.tv:443";
const channelPattern = /^[a-z0-9_]{1,25}$/;
const minReconnectDelayMs = 1_000;
const maxReconnectDelayMs = 30_000;
const idleTimeoutMs = 60_000;
const pongTimeoutMs = 10_000;
const connectTimeoutMs = 10_000;

// Source
export class TwitchChatSource implements OverlayEventSource {
  readonly #emitter = new OverlayEventEmitter();
  readonly #channel: string;
  readonly #url: string;
  #socket: WebSocket | null = null;
  #running = false;
  #reconnectAttempts = 0;
  #joinedChannelId: string | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #idleTimer: ReturnType<typeof setTimeout> | undefined;
  #pongTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: TwitchChatSourceOptions) {
    const channel = normalizeChannel(options.channel);
    if (channel === null) {
      throw new Error(`Invalid Twitch channel name: "${options.channel}"`);
    }
    this.#channel = channel;
    this.#url = options.url ?? defaultUrl;
  }

  subscribe(listener: OverlayEventListener): () => void {
    return this.#emitter.subscribe(listener);
  }

  start(): void {
    if (this.#running) {
      return;
    }
    this.#running = true;
    this.#connect();
  }

  stop(): void {
    this.#running = false;
    clearTimeout(this.#reconnectTimer);
    const socket = this.#socket;
    if (socket !== null) {
      this.#abandon(socket);
    }
  }

  // Connection
  #connect(): void {
    this.#emitState("connecting");
    this.#joinedChannelId = null;

    const socket = new WebSocket(this.#url);
    this.#socket = socket;
    this.#pongTimer = setTimeout(() => this.#abandon(socket), connectTimeoutMs);

    socket.addEventListener("open", () => {
      socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      socket.send(`NICK justinfan${Math.floor(Math.random() * 90_000) + 10_000}`);
      socket.send(`JOIN #${this.#channel}`);
      this.#resetIdleTimer(socket);
    });

    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (this.#socket !== socket || typeof event.data !== "string") {
        return;
      }
      this.#resetIdleTimer(socket);
      for (const line of event.data.split("\r\n")) {
        const message = line === "" ? null : parseIrcMessage(line);
        if (message !== null) {
          this.#handleMessage(socket, message);
        }
      }
    });

    socket.addEventListener("close", () => {
      if (this.#socket === socket) {
        this.#handleDisconnect();
      }
    });
  }

  #handleMessage(socket: WebSocket, message: IrcMessage): void {
    switch (message.command) {
      case "PING":
        socket.send(`PONG :${message.params[0] ?? "tmi.twitch.tv"}`);
        return;
      case "RECONNECT":
        this.#reconnectAttempts = 0;
        this.#abandon(socket);
        return;
      case "NOTICE":
        console.warn(`Twitch notice: ${message.params[1] ?? ""}`);
        return;
    }

    const event = mapChatEvent(message);
    if (event === null) {
      return;
    }
    if (event.type === "channel.joined") {
      if (this.#joinedChannelId === event.channelId) {
        return;
      }
      this.#joinedChannelId = event.channelId;
      this.#reconnectAttempts = 0;
      this.#emitState("connected");
    }
    this.#emitter.emit(event);
  }

  #abandon(socket: WebSocket): void {
    if (this.#socket !== socket) {
      return;
    }
    socket.close();
    this.#handleDisconnect();
  }

  #handleDisconnect(): void {
    this.#socket = null;
    clearTimeout(this.#idleTimer);
    clearTimeout(this.#pongTimer);
    this.#emitState("disconnected");
    if (this.#running) {
      this.#scheduleReconnect();
    }
  }

  #scheduleReconnect(): void {
    const baseDelay = Math.min(maxReconnectDelayMs, minReconnectDelayMs * 2 ** this.#reconnectAttempts);
    const delay = baseDelay * (0.8 + Math.random() * 0.4);
    this.#reconnectAttempts += 1;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = setTimeout(() => {
      if (this.#running) {
        this.#connect();
      }
    }, delay);
  }

  // Keepalive
  #resetIdleTimer(socket: WebSocket): void {
    clearTimeout(this.#idleTimer);
    clearTimeout(this.#pongTimer);
    this.#idleTimer = setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        this.#abandon(socket);
        return;
      }
      socket.send("PING :keepalive");
      this.#pongTimer = setTimeout(() => this.#abandon(socket), pongTimeoutMs);
    }, idleTimeoutMs);
  }

  // Helpers
  #emitState(state: ConnectionState): void {
    this.#emitter.emit({ type: "connection.state", platform: "twitch", state });
  }
}

export function normalizeChannel(value: string): string | null {
  const channel = value.trim().replace(/^#/, "").toLowerCase();
  return channelPattern.test(channel) ? channel : null;
}
