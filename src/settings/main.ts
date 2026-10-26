import { subTiers, tierLabel, type AlertType } from "../shared/alerts.ts";
import { alertboxOverlayId, alertboxSettings, alertTypeDefinitions, alertTypeForSection } from "../overlays/alertbox/alertbox-config.ts";
import { chatboxOverlayId, chatboxSettings } from "../overlays/chatbox/chatbox-config.ts";
import { goalKindForSection, goalOverlayId, goalSettings } from "../overlays/goal/goal-config.ts";
import { recentOverlayId, recentSettings, recentTypeForSection } from "../overlays/recent/recent-config.ts";
import { topEmotesOverlayId, topEmotesSettings } from "../overlays/topemotes/topemotes-config.ts";
import { isRecord } from "../shared/json.ts";
import { postPreviewMessage, previewAlertMessage } from "../shared/preview-messages.ts";
import { normalizeChannel } from "../shared/twitch/twitch-chat-source.ts";
import { MediaLibrary } from "./media-library.ts";
import { createOverlayEditor, type OverlayEditor } from "./overlay-editor.ts";
import { setupTwitchAccount } from "./twitch-account.ts";

// Constants
const tabNames = ["chatbox", "alertbox", "goals", "recent", "topemotes"] as const;

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
  const amount = document.createElement("input");
  amount.type = "number";
  amount.min = "0";
  amount.className = "number";
  const from = document.createElement("input");
  from.placeholder = "Twitch name";
  from.autocomplete = "off";
  from.spellcheck = false;
  from.title = "Optional. With a Twitch name the test uses its profile picture and matches its variants.";
  const tier = document.createElement("select");
  tier.setAttribute("aria-label", "Tier");
  tier.append(...subTiers.map((value) => new Option(tierLabel(value), value)));
  tier.value = "1";
  const message = document.createElement("input");
  message.placeholder = "Message";
  message.autocomplete = "off";
  message.setAttribute("aria-label", "Message of the viewer");
  let type: AlertType = "follow";

  const selectType = (section: string): void => {
    type = alertTypeForSection(section);
    const definition = alertTypeDefinitions[type];
    const counted = definition.amount;
    amount.disabled = counted === null;
    amount.value = "";
    amount.placeholder = counted === null ? "" : String(defaultTestAmount(type));
    amount.title = counted === null ? "" : `Number of ${counted}`;
    amount.setAttribute("aria-label", amount.title || "Number");
    tier.hidden = !definition.tiers;
    message.hidden = !definition.message;
    sendTest.title = `Plays a ${definition.label.toLowerCase()} alert in every open alert box, e.g. in OBS`;
  };

  const testAlert = (): Readonly<Record<string, unknown>> => ({
    type,
    ...(amount.disabled ? {} : { amount: Number(amount.value || amount.placeholder) }),
    ...(from.value.trim() === "" ? {} : { userName: from.value.trim() }),
    ...(tier.hidden ? {} : { tier: tier.value }),
    ...(message.hidden || message.value.trim() === "" ? {} : { message: message.value.trim() }),
  });

  const showInPreview = button("Show in preview", "secondary", () => {
    const alert = testAlert();
    void lookUpUser(from.value.trim()).then((user) => postPreviewMessage(editor.frame, previewAlertMessage, { alert: { ...alert, ...user } }));
  });
  const sendTest = button("Send to OBS", "secondary", () => {
    fetch("/api/alerts/test", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testAlert()),
    }).then(
      (response) =>
        response.ok
          ? editor.showStatus("ok", "Test alert sent to all open alert boxes (with the saved settings).")
          : editor.showStatus("error", `Sending the test alert failed: HTTP ${response.status}`),
      (error: unknown) => editor.showStatus("error", `Sending the test alert failed: ${error instanceof Error ? error.message : String(error)}`),
    );
  });

  const editor = await createOverlayEditor({
    container: getElement("alertbox-editor", HTMLElement),
    title: "Alert box",
    overlayId: alertboxOverlayId,
    schema: alertboxSettings,
    previewPath: "/alertbox/?preview",
    overlayPath: "/alertbox/",
    overlayHint: "To show only some alert types in a browser source, add for example ?types=follow,raid to the URL. Types: follow, sub, gift, cheer, raid.",
    media,
    onSectionChange: selectType,
  });
  selectType(editor.activeSection() ?? "");

  editors.set("alertbox", editor);
  const testRow = document.createElement("div");
  testRow.className = "alert-test";
  const label = document.createElement("span");
  label.className = "muted";
  label.textContent = "Test";
  testRow.append(label, amount, tier, from, message, showInPreview, sendTest);
  editor.toolbar.parentElement?.append(testRow);
}

async function setupGoalsEditor(media: MediaLibrary): Promise<void> {
  let editor: OverlayEditor | null = null;
  let previewPath = "/goal/?preview&goal=followers";
  const editorPromise = createOverlayEditor({
    container: getElement("goals-editor", HTMLElement),
    title: "Goal",
    overlayId: goalOverlayId,
    schema: goalSettings,
    previewPath,
    overlayPath: "/goal/?goal=followers",
    overlayHint: "Use ?goal=followers for the follower goal and ?goal=subs for the sub goal. Needs the Twitch login.",
    media,
    onSectionChange: (section) => {
      const path = `/goal/?preview&goal=${goalKindForSection(section)}`;
      if (path !== previewPath && section !== "General") {
        previewPath = path;
        editor?.setPreviewPath(path);
      }
    },
  });
  editor = await editorPromise;
  editors.set("goals", editor);
}

async function setupRecentEditor(media: MediaLibrary): Promise<void> {
  let editor: OverlayEditor | null = null;
  let previewPath = "/recent/?preview&type=follow";
  const editorPromise = createOverlayEditor({
    container: getElement("recent-editor", HTMLElement),
    title: "Recent events",
    overlayId: recentOverlayId,
    schema: recentSettings,
    previewPath,
    overlayPath: "/recent/?type=follow",
    overlayHint: "Choose the events with ?type=follow, sub, gift, cheer or raid. Needs the Twitch login; test alerts are not listed.",
    media,
    onSectionChange: (section) => {
      const path = `/recent/?preview&type=${recentTypeForSection(section)}`;
      if (path !== previewPath && section !== "General") {
        previewPath = path;
        editor?.setPreviewPath(path);
      }
    },
  });
  editor = await editorPromise;
  editors.set("recent", editor);
}

async function setupTopEmotesEditor(media: MediaLibrary): Promise<void> {
  const editor = await createOverlayEditor({
    container: getElement("topemotes-editor", HTMLElement),
    title: "Top emotes",
    overlayId: topEmotesOverlayId,
    schema: topEmotesSettings,
    previewPath: "/topemotes/?preview",
    overlayPath: "/topemotes/",
    overlayHint: "Counts the emotes in the chat of the entered channel while the browser source is open. The preview shows sample emotes.",
    media,
    keepOnReset: ["channel"],
    prepareSave: (values) => {
      const channel = normalizeChannel(values.channel);
      return channel === null ? "Please enter a valid Twitch channel name." : { ...values, channel };
    },
  });
  editors.set("topemotes", editor);
}

function defaultTestAmount(type: AlertType): number {
  return type === "cheer" ? 100 : 5;
}

async function lookUpUser(name: string): Promise<Readonly<Record<string, unknown>>> {
  if (name === "") {
    return {};
  }
  try {
    const response = await fetch(`/api/twitch/logins/${encodeURIComponent(name.replace(/^@/, ""))}`, { cache: "no-store" });
    const data: unknown = response.ok ? await response.json() : null;
    if (isRecord(data)) {
      return { userName: data["displayName"], userLogin: data["login"], avatarUrl: data["largeProfileImageUrl"] };
    }
  } catch {
    return { userLogin: name.toLowerCase() };
  }
  return { userLogin: name.toLowerCase() };
}

// Startup
async function start(): Promise<void> {
  setupTabs();
  setupTwitchAccount(getElement("twitch-account", HTMLDivElement));
  void showVersion();
  const media = new MediaLibrary();
  await media.refresh().catch(() => undefined);
  await Promise.all([
    setupChatboxEditor(media),
    setupAlertboxEditor(media),
    setupGoalsEditor(media),
    setupRecentEditor(media),
    setupTopEmotesEditor(media),
  ]);
}

void start();
