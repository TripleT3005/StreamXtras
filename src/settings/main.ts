import { subTiers, tierLabel, type AlertType } from "../shared/alerts.ts";
import { alertboxOverlayId, alertboxSettings, alertTypeDefinitions, alertTypeForSection } from "../overlays/alertbox/alertbox-config.ts";
import { chatboxOverlayId, chatboxSettings } from "../overlays/chatbox/chatbox-config.ts";
import { goalKindForSection, goalOverlayId, goalSettings } from "../overlays/goal/goal-config.ts";
import { recentOverlayId, recentSettings, recentTypeForSection } from "../overlays/recent/recent-config.ts";
import { topEmotesOverlayId, topEmotesSettings } from "../overlays/topemotes/topemotes-config.ts";
import { loadLanguage, saveLanguage, t, translatePage, type LanguageStatus } from "../shared/i18n.ts";
import { generalSection } from "../shared/settings.ts";
import { fetchAlertControl, sendAlertAction, subscribeToAlertControl, type AlertAction, type AlertControlStatus } from "../shared/alert-control.ts";
import { isRecord } from "../shared/json.ts";
import { postPreviewMessage, previewAlertMessage } from "../shared/preview-messages.ts";
import { normalizeChannel } from "../shared/twitch/twitch-chat-source.ts";
import { MediaLibrary } from "./media-library.ts";
import { createOverlayEditor, type OverlayEditor } from "./overlay-editor.ts";
import { setupTwitchAccount } from "./twitch-account.ts";

// Constants
const tabNames = ["chatbox", "alertbox", "goals", "recent", "topemotes"] as const;
const channelFieldIds = ["chatbox-channel", "topemotes-channel"];

// State
const editors = new Map<string, OverlayEditor>();
let ownChannel: string | null = null;

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
      target.textContent = t("page.version", { version: data["version"] });
    }
  } catch {
    target.textContent = t("page.unreachable");
  }
}

async function showUpdate(): Promise<void> {
  const link = getElement("update-link", HTMLAnchorElement);
  try {
    const data: unknown = await (await fetch("/api/update", { cache: "no-store" })).json();
    if (isRecord(data) && data["available"] === true && typeof data["version"] === "string" && typeof data["url"] === "string") {
      link.href = data["url"];
      link.textContent = t("page.update", { version: data["version"] });
      link.hidden = false;
    }
  } catch {
    link.hidden = true;
  }
}

// Language
function setupLanguage(status: LanguageStatus | null): void {
  const select = getElement("language", HTMLSelectElement);
  if (status === null) {
    select.parentElement?.setAttribute("hidden", "");
    return;
  }
  const nameOf = (code: string): string => status.languages.find((language) => language.code === code)?.name ?? code;
  const options = (category: string): HTMLOptionElement[] =>
    status.languages.filter((language) => language.category === category).map((language) => new Option(language.name, language.code));
  const group = (label: string, category: string): HTMLOptGroupElement[] => {
    const children = options(category);
    if (children.length === 0) {
      return [];
    }
    const element = document.createElement("optgroup");
    element.label = t(label);
    element.append(...children);
    return [element];
  };
  select.replaceChildren(
    new Option(t("page.language.automatic", { language: nameOf(status.automatic) }), ""),
    ...options("standard"),
    ...group("page.language.dialects", "dialect"),
    ...group("page.language.fun", "fun"),
  );
  select.value = status.preference ?? "";
  select.title = t("page.language.hint");
  select.addEventListener("change", () => {
    select.disabled = true;
    saveLanguage(select.value === "" ? null : select.value).then(
      () => location.reload(),
      () => {
        select.disabled = false;
        select.value = status.preference ?? "";
      },
    );
  });
}

// Alert control
function setupAlertControl(): HTMLElement {
  const banner = getElement("pause-banner", HTMLDivElement);
  const row = document.createElement("div");
  row.className = "alert-test alert-control";
  const label = document.createElement("span");
  label.className = "muted";
  label.textContent = t("control.live");
  const status = document.createElement("p");
  status.className = "hint";
  status.setAttribute("role", "status");
  const run = (action: AlertAction): void => {
    status.textContent = "";
    sendAlertAction(action).then(render, (error: unknown) => (status.textContent = error instanceof Error ? error.message : String(error)));
  };
  const replay = button(t("control.replay"), "secondary", () => run("replay"));
  replay.title = t("control.replay.hint");
  const skip = button(t("control.skip"), "secondary", () => run("skip"));
  skip.title = t("control.skip.hint");
  let paused = false;
  const pause = button(t("control.pause"), "secondary", () => run(paused ? "resume" : "pause"));
  pause.title = t("control.pause.hint");
  const render = (control: AlertControlStatus): void => {
    paused = control.paused;
    banner.hidden = !paused;
    pause.textContent = t(paused ? "control.resume" : "control.pause");
    pause.classList.toggle("active", paused);
  };
  getElement("resume-alerts", HTMLButtonElement).addEventListener("click", () => run("resume"));
  subscribeToAlertControl(render);
  void fetchAlertControl().then(render);
  row.append(label, replay, skip, pause, status);
  return row;
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
    title: "overlay.chatbox",
    overlayId: chatboxOverlayId,
    schema: chatboxSettings,
    previewPath: "/chatbox/?preview",
    overlayPath: "/chatbox/",
    media,
    keepOnReset: ["channel"],
    prepareSave: (values) => {
      const channel = normalizeChannel(values.channel);
      return channel === null ? "editor.invalid_channel" : { ...values, channel };
    },
  });

  editors.set("chatbox", editor);
  const toggle = document.createElement("label");
  toggle.className = "toggle";
  toggle.title = t("chatbox.live_preview.hint");
  const live = document.createElement("input");
  live.type = "checkbox";
  live.addEventListener("change", () => editor.setPreviewPath(live.checked ? "/chatbox/?preview=live" : "/chatbox/?preview"));
  toggle.append(live, ` ${t("chatbox.live_preview")}`);
  editor.toolbar.append(toggle);
}

async function setupAlertboxEditor(media: MediaLibrary): Promise<void> {
  const amount = document.createElement("input");
  amount.type = "number";
  amount.min = "0";
  amount.className = "number";
  const from = document.createElement("input");
  from.placeholder = t("test.twitch_name");
  from.autocomplete = "off";
  from.spellcheck = false;
  from.title = t("test.twitch_name.hint");
  const tier = document.createElement("select");
  tier.setAttribute("aria-label", t("test.tier"));
  tier.append(...subTiers.map((value) => new Option(tierLabel(value), value)));
  tier.value = "1";
  const message = document.createElement("input");
  message.placeholder = t("test.message");
  message.autocomplete = "off";
  message.setAttribute("aria-label", t("test.message.label"));
  let type: AlertType = "follow";

  const selectType = (section: string): void => {
    type = alertTypeForSection(section);
    const definition = alertTypeDefinitions[type];
    const { counted } = definition;
    amount.disabled = counted === null;
    amount.value = "";
    amount.placeholder = counted === null ? "" : String(defaultTestAmount(type));
    amount.title = counted === null ? "" : t(counted.amount);
    amount.setAttribute("aria-label", amount.title || t("test.number"));
    tier.hidden = !definition.tiers;
    message.hidden = !definition.message;
    sendTest.title = t(definition.test);
  };

  const testAlert = (): Readonly<Record<string, unknown>> => ({
    type,
    ...(amount.disabled ? {} : { amount: Number(amount.value || amount.placeholder) }),
    ...(from.value.trim() === "" ? {} : { userName: from.value.trim() }),
    ...(tier.hidden ? {} : { tier: tier.value }),
    ...(message.hidden || message.value.trim() === "" ? {} : { message: message.value.trim() }),
  });

  const showInPreview = button(t("test.preview"), "secondary", () => {
    const alert = testAlert();
    void lookUpUser(from.value.trim()).then((user) => postPreviewMessage(editor.frame, previewAlertMessage, { alert: { ...alert, ...user } }));
  });
  const sendTest = button(t("test.send"), "secondary", () => {
    fetch("/api/alerts/test", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testAlert()),
    }).then(
      (response) =>
        response.ok
          ? editor.showStatus("ok", t("test.sent"))
          : editor.showStatus("error", t("test.failed", { error: `HTTP ${response.status}` })),
      (error: unknown) => editor.showStatus("error", t("test.failed", { error: error instanceof Error ? error.message : String(error) })),
    );
  });

  const editor = await createOverlayEditor({
    container: getElement("alertbox-editor", HTMLElement),
    title: "overlay.alertbox",
    overlayId: alertboxOverlayId,
    schema: alertboxSettings,
    previewPath: "/alertbox/?preview",
    overlayPath: "/alertbox/",
    overlayHint: "alertbox.url_hint",
    media,
    onSectionChange: selectType,
  });
  selectType(editor.activeSection() ?? "");

  editors.set("alertbox", editor);
  const testRow = document.createElement("div");
  testRow.className = "alert-test";
  const label = document.createElement("span");
  label.className = "muted";
  label.textContent = t("test.label");
  testRow.append(label, amount, tier, from, message, showInPreview, sendTest);
  editor.toolbar.parentElement?.append(testRow, setupAlertControl());
}

async function setupGoalsEditor(media: MediaLibrary): Promise<void> {
  let editor: OverlayEditor | null = null;
  let previewPath = "/goal/?preview&goal=followers";
  const editorPromise = createOverlayEditor({
    container: getElement("goals-editor", HTMLElement),
    title: "overlay.goals",
    overlayId: goalOverlayId,
    schema: goalSettings,
    previewPath,
    overlayPath: "/goal/?goal=followers",
    overlayHint: "goal.url_hint",
    media,
    onSectionChange: (section) => {
      const path = `/goal/?preview&goal=${goalKindForSection(section)}`;
      if (path !== previewPath && section !== generalSection) {
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
    title: "overlay.recent",
    overlayId: recentOverlayId,
    schema: recentSettings,
    previewPath,
    overlayPath: "/recent/?type=follow",
    overlayHint: "recent.url_hint",
    media,
    onSectionChange: (section) => {
      const path = `/recent/?preview&type=${recentTypeForSection(section)}`;
      if (path !== previewPath && section !== generalSection) {
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
    title: "overlay.topemotes",
    overlayId: topEmotesOverlayId,
    schema: topEmotesSettings,
    previewPath: "/topemotes/?preview",
    overlayPath: "/topemotes/",
    overlayHint: "topemotes.url_hint",
    media,
    keepOnReset: ["channel"],
    prepareSave: (values) => {
      const channel = normalizeChannel(values.channel);
      return channel === null ? "editor.invalid_channel" : { ...values, channel };
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

function fillOwnChannel(): void {
  if (ownChannel === null) {
    return;
  }
  for (const id of channelFieldIds) {
    const input = document.getElementById(id);
    if (input instanceof HTMLInputElement && input.value.trim() === "") {
      input.value = ownChannel;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
}

// Startup
async function start(): Promise<void> {
  setupLanguage(await loadLanguage());
  translatePage();
  setupTabs();
  const diagnostics = getElement("diagnostics-link", HTMLAnchorElement);
  setupTwitchAccount(getElement("twitch-account", HTMLDivElement), (login) => {
    diagnostics.href = login === null ? "../diagnostics/" : `../diagnostics/?channel=${encodeURIComponent(login)}`;
    ownChannel = login;
    fillOwnChannel();
  });
  void showVersion();
  void showUpdate();
  const media = new MediaLibrary();
  await media.refresh().catch(() => undefined);
  await Promise.all([
    setupChatboxEditor(media),
    setupAlertboxEditor(media),
    setupGoalsEditor(media),
    setupRecentEditor(media),
    setupTopEmotesEditor(media),
  ]);
  fillOwnChannel();
}

void start();
