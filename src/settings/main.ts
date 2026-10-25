import { chatboxOverlayId, chatboxSettings, readChatboxConfig } from "../overlays/chatbox/chatbox-config.ts";
import { previewMessageType } from "../overlays/chatbox/preview.ts";
import { fetchOverlaySettings, saveOverlaySettings, type ConfigSource } from "../shared/config.ts";
import { isRecord } from "../shared/json.ts";
import { defaultSettings } from "../shared/settings.ts";
import { normalizeChannel } from "../shared/twitch/twitch-chat-source.ts";
import { createSettingsForm, type FormValues } from "./settings-form.ts";

// Types
interface OverlayLink {
  readonly name: string;
  readonly path: string;
}

// Constants
const overlayLinks: readonly OverlayLink[] = [{ name: "Chat box", path: "/chatbox/" }];

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
  getElement("overlay-links", HTMLUListElement).replaceChildren(...overlayLinks.map(renderOverlayLink));
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
  copy.className = "secondary";
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
async function setupChatboxSettings(): Promise<void> {
  const formContainer = getElement("chatbox-form", HTMLFormElement);
  const fieldsContainer = getElement("chatbox-fields", HTMLDivElement);
  const saveButton = getElement("chatbox-save", HTMLButtonElement);
  const resetButton = getElement("chatbox-reset", HTMLButtonElement);
  const status = getElement("chatbox-status", HTMLParagraphElement);
  const frame = getElement("chatbox-preview", HTMLIFrameElement);
  const stage = getElement("chatbox-stage", HTMLDivElement);

  let stored: ConfigSource = await fetchOverlaySettings(chatboxOverlayId);
  let savedValues = JSON.stringify(readChatboxConfig(stored));
  let previewScheduled = false;

  const form = createSettingsForm(chatboxSettings, "chatbox", () => {
    updateDirtyState();
    schedulePreview();
  });
  fieldsContainer.replaceChildren(form.element);
  form.setValues(readChatboxConfig(stored));

  const currentConfig = (): ReturnType<typeof readChatboxConfig> => readChatboxConfig(form.values());

  const updateDirtyState = (): void => {
    const isDirty = JSON.stringify(currentConfig()) !== savedValues;
    saveButton.disabled = !isDirty;
    if (isDirty) {
      showStatus(status, "", "Unsaved changes. The preview already shows them.");
    }
  };

  const updatePreview = (): void => {
    previewScheduled = false;
    const config = currentConfig();
    const scale = Math.min(1, stage.clientWidth / config.width);
    frame.style.width = `${config.width}px`;
    frame.style.height = `${config.height}px`;
    frame.style.transform = `scale(${scale})`;
    stage.style.height = `${Math.ceil(config.height * scale)}px`;
    frame.contentWindow?.postMessage({ type: previewMessageType, settings: config }, location.origin);
  };

  const schedulePreview = (): void => {
    if (!previewScheduled) {
      previewScheduled = true;
      requestAnimationFrame(updatePreview);
    }
  };

  formContainer.addEventListener("submit", (event) => {
    event.preventDefault();
    const values: FormValues = form.values();
    const channel = normalizeChannel(typeof values["channel"] === "string" ? values["channel"] : "");
    if (channel === null) {
      showStatus(status, "error", "Please enter a valid Twitch channel name.");
      return;
    }
    const updated = { ...stored, ...currentConfig(), channel };
    saveOverlaySettings(chatboxOverlayId, updated).then(
      () => {
        stored = updated;
        savedValues = JSON.stringify(readChatboxConfig(stored));
        form.setValues(readChatboxConfig(stored));
        saveButton.disabled = true;
        showStatus(status, "ok", "Saved. Open chat boxes in OBS update automatically.");
      },
      (error: unknown) => showStatus(status, "error", `Saving failed: ${error instanceof Error ? error.message : String(error)}`),
    );
  });

  resetButton.addEventListener("click", () => {
    form.setValues({ ...defaultSettings(chatboxSettings), channel: currentConfig().channel });
    updateDirtyState();
    schedulePreview();
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-preview-background]")) {
    button.addEventListener("click", () => {
      stage.dataset["background"] = button.dataset["previewBackground"] ?? "checkered";
      for (const other of document.querySelectorAll("[data-preview-background]")) {
        other.setAttribute("aria-pressed", String(other === button));
      }
    });
  }

  frame.addEventListener("load", schedulePreview);
  new ResizeObserver(schedulePreview).observe(stage);
  frame.src = "/chatbox/?preview";
  saveButton.disabled = true;
}

function showStatus(target: HTMLElement, kind: "" | "ok" | "error", message: string): void {
  target.className = `status ${kind}`.trim();
  target.textContent = message;
}

// Startup
renderOverlayLinks();
void showVersion();
void setupChatboxSettings();
