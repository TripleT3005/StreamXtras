import { loadConfigSource } from "../../shared/config.ts";
import type { OverlayEvent } from "../../shared/events.ts";
import { normalizeChannel, TwitchChatSource } from "../../shared/twitch/twitch-chat-source.ts";
import { readChatboxConfig } from "./chatbox-config.ts";
import { ChatList } from "./chat-list.ts";

// Startup
async function start(): Promise<void> {
  const container = document.getElementById("messages");
  const status = document.getElementById("status");
  if (container === null || status === null) {
    return;
  }

  const config = readChatboxConfig(await loadConfigSource(new URL("chatbox.config.json", location.href), location.search));
  if (normalizeChannel(config.channel) === null) {
    status.textContent = "No valid channel configured. Copy chatbox.config.example.json to chatbox.config.json and set \"channel\".";
    status.hidden = false;
    return;
  }

  const chatList = new ChatList(container, config.maxMessages);
  const source = new TwitchChatSource({ channel: config.channel });
  source.subscribe((event) => handleEvent(chatList, event));
  source.start();
}

// Events
function handleEvent(chatList: ChatList, event: OverlayEvent): void {
  switch (event.type) {
    case "chat.message":
      chatList.add(event);
      break;
    case "chat.delete":
      chatList.remove(event.messageId);
      break;
    case "chat.clear":
      chatList.clear(event.userId);
      break;
    case "connection.state":
      console.info(`Chat connection: ${event.state}`);
      break;
    case "channel.joined":
      console.info(`Joined #${event.channelLogin} (${event.channelId})`);
      break;
  }
}

void start();
