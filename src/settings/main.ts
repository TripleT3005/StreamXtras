import { fetchOverlaySettings, saveOverlaySettings } from "../shared/config.ts";
import { isRecord } from "../shared/json.ts";
import { normalizeChannel } from "../shared/twitch/twitch-chat-source.ts";

// Types
interface OverlayLink {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

// Constants
const overlayLinks: readonly OverlayLink[] = [{ id: "chatbox", name: "Chat box", path: "/chatbox/" }];

// Elements
function getElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Element #${id} is missing`);
  }
  return element;
}

// Version
async function showVersion(): Promise<void> {
  const target = getElement("version", HTMLParagraphElement);
  try {
    const data: unknown = await (await fetch("/api/health", { cache: "no-store" })).json();
    if (isRecord(data) && typeof data["version"] === "string") {
      target.textContent = `Version ${data["version"]}`;
    }
  } catch {
    target.textContent = "The companion app is not reachable.";
  }
}

// Overlay links
function renderOverlayLinks(): void {
  const list = getElement("overlay-links", HTMLUListElement);
  list.replaceChildren(...overlayLinks.map(renderOverlayLink));
}

function renderOverlayLink(overlay: OverlayLink): HTMLLIElement {
  const item = document.createElement("li");
  const name = document.createElement("span");
  const url = document.createElement("input");
  const copy = document.createElement("button");

  name.textContent = overlay.name;
  url.readOnly = true;
  url.value = new URL(overlay.path, location.origin).href;
  url.setAttribute("aria-label", `${overlay.name} URL`);
  url.addEventListener("focus", () => url.select());
  copy.type = "button";
  copy.textContent = "Copy";
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(url.value).then(() => {
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    });
  });

  item.append(name, url, copy);
  return item;
}

// Chat box settings
async function setupChatboxForm(): Promise<void> {
  const form = getElement("chatbox-form", HTMLFormElement);
  const channelInput = getElement("chatbox-channel", HTMLInputElement);
  const status = getElement("chatbox-status", HTMLParagraphElement);

  let settings = await fetchOverlaySettings("chatbox");
  channelInput.value = typeof settings["channel"] === "string" ? settings["channel"] : "";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const channel = normalizeChannel(channelInput.value);
    if (channel === null) {
      showStatus(status, "error", "Please enter a valid Twitch channel name.");
      return;
    }
    const updated = { ...settings, channel };
    saveOverlaySettings("chatbox", updated).then(
      () => {
        settings = updated;
        channelInput.value = channel;
        showStatus(status, "ok", "Saved. Open chat boxes update automatically.");
      },
      (error: unknown) => showStatus(status, "error", `Saving failed: ${error instanceof Error ? error.message : String(error)}`),
    );
  });
}

function showStatus(target: HTMLElement, kind: "ok" | "error", message: string): void {
  target.className = `status ${kind}`;
  target.textContent = message;
}

// Startup
renderOverlayLinks();
void showVersion();
void setupChatboxForm();
