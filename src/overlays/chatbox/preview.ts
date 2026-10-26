import type { EmoteLookup } from "../../shared/emotes/emote.ts";
import { buildFragments } from "../../shared/emotes/fragments.ts";
import type { AnnouncementColor, ChatBadge, ChatMessageEvent, EmotePlacement } from "../../shared/events.ts";
import { onPreviewMessage, previewSettingsMessage } from "../../shared/preview-messages.ts";
import { isRecord } from "../../shared/json.ts";
import { hasStructuralChange } from "../../shared/settings.ts";
import { normalizeChannel } from "../../shared/twitch/twitch-chat-source.ts";
import { Chatbox } from "./chatbox.ts";
import { chatboxSettings, missingChannelMessage, readChatboxConfig, type ChatboxConfig } from "./chatbox-config.ts";
import { applyChatboxStyle } from "./chatbox-style.ts";
import { ChatList } from "./chat-list.ts";
import { BadgeLibrary } from "../../shared/twitch/badge-library.ts";
import { renderMessage, type MessageContext } from "./message-view.ts";

// Types
interface DemoMessage {
  readonly name: string;
  readonly color: string | null;
  readonly badges: readonly string[];
  readonly text: string;
  readonly emotes?: readonly EmotePlacement[];
  readonly isAction?: boolean;
  readonly announcement?: AnnouncementColor;
}

export type PreviewMode = "demo" | "live";

// Constants
const demoIntervalMs = 2500;
const liveRestartDelayMs = 700;
const initialMessageCount = 6;
const noEmotes: EmoteLookup = { get: () => undefined };
const demoBadges = new BadgeLibrary();
const demoContext: MessageContext = { badges: demoBadges, thirdPartyBadges: null, avatars: null };

const demoMessages: readonly DemoMessage[] = [
  { name: "StreamerName", color: "#9146FF", badges: ["broadcaster/1"], text: "Welcome to the stream Kappa", emotes: [{ id: "25", start: 22, end: 26 }] },
  { name: "ModeratorName", color: "#1E90FF", badges: ["moderator/1", "subscriber/12"], text: "Remember to stay friendly in chat <3", emotes: [{ id: "9", start: 34, end: 35 }] },
  { name: "dark_blue_viewer", color: "#0000FF", badges: ["subscriber/3", "premium/1"], text: "Dark colors are lightened when readable name colors are enabled" },
  { name: "NewViewer", color: null, badges: [], text: "hello everyone, first time here!" },
  { name: "VipName", color: "#FF69B4", badges: ["vip/1"], text: "dances happily", isAction: true },
  { name: "ModeratorName", color: "#1E90FF", badges: ["moderator/1"], text: "Giveaway starts in five minutes!", announcement: "purple" },
  { name: "LongMessageWriter", color: "#00FF7F", badges: ["turbo/1"], text: "This is a longer message to show how text wraps inside the chat box when it does not fit into a single line Kappa Kappa", emotes: [{ id: "25", start: 108, end: 112 }, { id: "25", start: 114, end: 118 }] },
  { name: "GoldenViewer", color: "#DAA520", badges: ["founder/0"], text: "GG that was close" },
];

// Preview
export function startPreview(root: HTMLElement, container: HTMLElement, status: HTMLElement, mode: PreviewMode): void {
  const apply = mode === "live" ? createLivePreview(root, container, status) : createDemoPreview(root, container);
  onPreviewMessage(previewSettingsMessage, (data) => {
    if (isRecord(data["settings"])) {
      apply(readChatboxConfig(data["settings"]));
    }
  });
  apply(readChatboxConfig({}));
}

function createLivePreview(root: HTMLElement, container: HTMLElement, status: HTMLElement): (config: ChatboxConfig) => void {
  let current: ChatboxConfig | null = null;
  let chatbox: Chatbox | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  const restart = (config: ChatboxConfig): void => {
    chatbox?.stop();
    chatbox = null;
    container.replaceChildren();
    const hasChannel = normalizeChannel(config.channel) !== null;
    status.textContent = hasChannel ? "" : missingChannelMessage;
    status.hidden = hasChannel;
    if (hasChannel) {
      chatbox = new Chatbox(config, container);
      chatbox.start();
    }
  };

  return (next) => {
    applyChatboxStyle(root, next);
    const isStructural = current === null || hasStructuralChange(chatboxSettings, current, next);
    current = next;
    if (!isStructural) {
      chatbox?.configure(next);
      return;
    }
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (current !== null) {
        restart(current);
      }
    }, liveRestartDelayMs);
  };
}

function createDemoPreview(root: HTMLElement, container: HTMLElement): (config: ChatboxConfig) => void {
  void demoBadges.loadGlobal();
  let config = readChatboxConfig({});
  let nextIndex = 0;
  const chatList = new ChatList(container, config.maxMessages, config.hideAfterSeconds);

  const addMessage = (): void => {
    const demo = demoMessages[nextIndex % demoMessages.length];
    nextIndex += 1;
    if (demo !== undefined) {
      const message = toChatMessage(demo, nextIndex);
      chatList.add(renderMessage(message, buildFragments(message.text, message.emotes, noEmotes), config, demoContext));
    }
  };

  const renderAll = (): void => {
    root.dataset["rerendering"] = "true";
    container.replaceChildren();
    nextIndex = Math.max(0, nextIndex - initialMessageCount);
    for (let count = 0; count < initialMessageCount; count++) {
      addMessage();
    }
    setTimeout(() => delete root.dataset["rerendering"], 50);
  };

  setInterval(addMessage, demoIntervalMs);
  return (next) => {
    config = next;
    applyChatboxStyle(root, config);
    chatList.configure(config.maxMessages, config.hideAfterSeconds);
    renderAll();
  };
}

function toChatMessage(demo: DemoMessage, sequence: number): ChatMessageEvent {
  return {
    type: "chat.message",
    platform: "twitch",
    id: `preview-${sequence}`,
    channelId: "preview",
    sourceChannelId: null,
    user: {
      id: `preview-${demo.name}`,
      login: demo.name.toLowerCase(),
      displayName: demo.name,
      color: demo.color,
      badges: demo.badges.map(toBadge),
    },
    text: demo.text,
    isAction: demo.isAction ?? false,
    announcement: demo.announcement ?? null,
    emotes: demo.emotes ?? [],
    timestamp: Date.now(),
  };
}

function toBadge(value: string): ChatBadge {
  const [set = "", version = "1"] = value.split("/");
  return { set, version };
}
