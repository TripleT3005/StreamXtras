import { alertboxOverlayId, alertboxSettings } from "../overlays/alertbox/alertbox-config.ts";
import { chatboxOverlayId, chatboxSettings } from "../overlays/chatbox/chatbox-config.ts";
import { isRecord } from "../shared/json.ts";
import { postPreviewMessage, previewAlertMessage } from "../shared/preview-messages.ts";
import { normalizeChannel } from "../shared/twitch/twitch-chat-source.ts";
import { MediaLibrary } from "./media-library.ts";
import { createOverlayEditor, type OverlayEditor } from "./overlay-editor.ts";
import { setupTwitchAccount } from "./twitch-account.ts";

// Constants
const tabNames = ["chatbox", "alertbox"] as const;

// State
const editors = new Map<string, OverlayEditor>();

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

// Tabs
function setupTabs(): void {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const activate = (name: string, updateHash: boolean): void => {
    const active = tabNames.find((tab) => tab === name) ?? tabNames[0];
    for (const tab of tabs) {
      const isActive = tab.dataset["tab"] === active;
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
      if (panel !== null) {
        panel.hidden = !isActive;
      }
    }
    if (updateHash) {
      history.replaceState(null, "", `#${active}`);
    }
    editors.get(active)?.refreshPreview();
  };
  for (const tab of tabs) {
    tab.addEventListener("click", () => activate(tab.dataset["tab"] ?? "", true));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      const index = tabs.indexOf(tab);
      const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      next?.focus();
      next?.click();
    });
  }
  activate(location.hash.slice(1), false);
}

// Editors
async function setupChatboxEditor(media: MediaLibrary): Promise<void> {
  const editor = await createOverlayEditor({
    container: getElement("chatbox-editor", HTMLElement),
    title: "Chat box",
    overlayId: chatboxOverlayId,
    schema: chatboxSettings,
    previewPath: "/chatbox/?preview",
    overlayPath: "/chatbox/",
    media,
    keepOnReset: ["channel"],
    prepareSave: (values) => {
      const channel = normalizeChannel(values.channel);
      return channel === null ? "Please enter a valid Twitch channel name." : { ...values, channel };
    },
  });

  editors.set("chatbox", editor);
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
    overlayPath: "/alertbox/",
    media,
  });

  editors.set("alertbox", editor);
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
  setupTabs();
  setupTwitchAccount(getElement("twitch-account", HTMLDivElement));
  void showVersion();
  const media = new MediaLibrary();
  await media.refresh().catch(() => undefined);
  await Promise.all([setupChatboxEditor(media), setupAlertboxEditor(media)]);
}

void start();
