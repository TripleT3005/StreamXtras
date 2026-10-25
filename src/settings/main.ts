import { alertboxOverlayId, alertboxSettings } from "../overlays/alertbox/alertbox-config.ts";
import { chatboxOverlayId, chatboxSettings } from "../overlays/chatbox/chatbox-config.ts";
import { isRecord } from "../shared/json.ts";
import { postPreviewMessage, previewAlertMessage } from "../shared/preview-messages.ts";
import { normalizeChannel } from "../shared/twitch/twitch-chat-source.ts";
import { MediaLibrary } from "./media-library.ts";
import { createOverlayEditor } from "./overlay-editor.ts";
import { setupTwitchAccount } from "./twitch-account.ts";

// Types
interface OverlayLink {
  readonly name: string;
  readonly path: string;
}

// Constants
const overlayLinks: readonly OverlayLink[] = [
  { name: "Chat box", path: "/chatbox/" },
  { name: "Alert box", path: "/alertbox/" },
];

// Elements
function getElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Element #${id} is missing`);
  }
  return element;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  if (className !== "") {
    element.className = className;
  }
  element.addEventListener("click", onClick);
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
  getElement("overlay-links", HTMLUListElement).replaceChildren(...overlayLinks.map(renderOverlayLink));
}

function renderOverlayLink(overlay: OverlayLink): HTMLLIElement {
  const item = document.createElement("li");
  const name = document.createElement("span");
  const url = document.createElement("input");
  name.textContent = overlay.name;
  url.readOnly = true;
  url.value = new URL(overlay.path, location.origin).href;
  url.setAttribute("aria-label", `${overlay.name} URL`);
  url.addEventListener("focus", () => url.select());
  const copy = button("Copy", "secondary", () => {
    void navigator.clipboard.writeText(url.value).then(() => {
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    });
  });
  item.append(name, url, copy);
  return item;
}

// Editors
async function setupChatboxEditor(media: MediaLibrary): Promise<void> {
  const editor = await createOverlayEditor({
    container: getElement("chatbox-editor", HTMLElement),
    title: "Chat box",
    overlayId: chatboxOverlayId,
    schema: chatboxSettings,
    previewPath: "/chatbox/?preview",
    media,
    keepOnReset: ["channel"],
    prepareSave: (values) => {
      const channel = normalizeChannel(values.channel);
      return channel === null ? "Please enter a valid Twitch channel name." : { ...values, channel };
    },
  });

  const toggle = document.createElement("label");
  toggle.className = "toggle";
  toggle.title = "Shows the real chat of the entered channel instead of sample messages";
  const live = document.createElement("input");
  live.type = "checkbox";
  live.addEventListener("change", () => editor.setPreviewPath(live.checked ? "/chatbox/?preview=live" : "/chatbox/?preview"));
  toggle.append(live, " Live chat");
  editor.toolbar.append(toggle);
}

async function setupAlertboxEditor(media: MediaLibrary): Promise<void> {
  const editor = await createOverlayEditor({
    container: getElement("alertbox-editor", HTMLElement),
    title: "Alert box",
    overlayId: alertboxOverlayId,
    schema: alertboxSettings,
    previewPath: "/alertbox/?preview",
    media,
  });

  const showInPreview = button("Show in preview", "secondary", () => postPreviewMessage(editor.frame, previewAlertMessage));
  const sendTest = button("Send test alert", "secondary", () => {
    fetch("/api/alerts/test", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "follow" }),
    }).then(
      (response) =>
        response.ok
          ? editor.showStatus("ok", "Test alert sent to all open alert boxes (with the saved settings).")
          : editor.showStatus("error", `Sending the test alert failed: HTTP ${response.status}`),
      (error: unknown) => editor.showStatus("error", `Sending the test alert failed: ${error instanceof Error ? error.message : String(error)}`),
    );
  });
  sendTest.title = "Plays a follow alert in every open alert box, e.g. in OBS";
  editor.toolbar.append(showInPreview);
  editor.actions.insertBefore(sendTest, editor.actions.lastElementChild);
}

// Startup
async function start(): Promise<void> {
  setupTwitchAccount(getElement("twitch-account", HTMLDivElement));
  renderOverlayLinks();
  void showVersion();
  const media = new MediaLibrary();
  await media.refresh().catch(() => undefined);
  await Promise.all([setupChatboxEditor(media), setupAlertboxEditor(media)]);
}

void start();
