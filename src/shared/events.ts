// Types
export type Platform = "twitch";

export interface EmotePlacement {
  readonly id: string;
  readonly start: number;
  readonly end: number;
}

export interface ChatBadge {
  readonly set: string;
  readonly version: string;
}

export interface ChatUser {
  readonly id: string;
  readonly login: string;
  readonly displayName: string;
  readonly color: string | null;
  readonly badges: readonly ChatBadge[];
}

export type AnnouncementColor = "primary" | "blue" | "green" | "orange" | "purple";

export interface ChatMessageEvent {
  readonly type: "chat.message";
  readonly platform: Platform;
  readonly id: string;
  readonly channelId: string;
  readonly sourceChannelId: string | null;
  readonly user: ChatUser;
  readonly text: string;
  readonly isAction: boolean;
  readonly announcement: AnnouncementColor | null;
  readonly emotes: readonly EmotePlacement[];
  readonly timestamp: number;
}

export interface ChatDeleteEvent {
  readonly type: "chat.delete";
  readonly platform: Platform;
  readonly messageId: string;
}

export interface ChatClearEvent {
  readonly type: "chat.clear";
  readonly platform: Platform;
  readonly userId: string | null;
}

export interface ChannelJoinedEvent {
  readonly type: "channel.joined";
  readonly platform: Platform;
  readonly channelId: string;
  readonly channelLogin: string;
}

export type ConnectionState = "connecting" | "connected" | "disconnected";

export interface ConnectionStateEvent {
  readonly type: "connection.state";
  readonly platform: Platform;
  readonly state: ConnectionState;
}

export type OverlayEvent =
  | ChatMessageEvent
  | ChatDeleteEvent
  | ChatClearEvent
  | ChannelJoinedEvent
  | ConnectionStateEvent;

export type OverlayEventListener = (event: OverlayEvent) => void;

export interface OverlayEventSource {
  subscribe(listener: OverlayEventListener): () => void;
  start(): void;
  stop(): void;
}

// Emitter
export class OverlayEventEmitter {
  readonly #listeners = new Set<OverlayEventListener>();

  subscribe(listener: OverlayEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(event: OverlayEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch (error: unknown) {
        console.error("Overlay event listener failed", error);
      }
    }
  }
}
