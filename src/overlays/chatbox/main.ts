import { fetchOverlaySettings, subscribeToSettings } from "../../shared/config.ts";
import { hasStructuralChange } from "../../shared/settings.ts";
import { normalizeChannel } from "../../shared/twitch/twitch-chat-source.ts";
import { Chatbox } from "./chatbox.ts";
import { chatboxOverlayId, chatboxSettings, missingChannelMessage, readChatboxConfig } from "./chatbox-config.ts";
import { applyChatboxStyle } from "./chatbox-style.ts";
import { startPreview } from "./preview.ts";

// Startup
async function start(): Promise<void> {
  const container = document.getElementById("messages");
  const status = document.getElementById("status");
  if (container === null || status === null) {
    return;
  }

  const root = document.documentElement;
  const urlValues = Object.fromEntries(new URLSearchParams(location.search));
  const previewMode = urlValues["preview"];
  if (previewMode !== undefined) {
    startPreview(root, container, status, previewMode === "live" ? "live" : "demo");
    return;
  }

  let config = readChatboxConfig({ ...(await fetchOverlaySettings(chatboxOverlayId)), ...urlValues });
  applyChatboxStyle(root, config);

  let chatbox: Chatbox | null = null;
  subscribeToSettings(chatboxOverlayId, (stored) => {
    const next = readChatboxConfig({ ...stored, ...urlValues });
    if (hasStructuralChange(chatboxSettings, config, next)) {
      location.reload();
      return;
    }
    config = next;
    applyChatboxStyle(root, config);
    chatbox?.configure(config);
  });

  if (normalizeChannel(config.channel) === null) {
    status.textContent = missingChannelMessage;
    status.hidden = false;
    return;
  }

  chatbox = new Chatbox(config, container);
  chatbox.start();
}

void start();
