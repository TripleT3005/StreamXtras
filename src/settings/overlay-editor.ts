import { fetchOverlaySettings, saveOverlaySettings, type ConfigSource } from "../shared/config.ts";
import { t } from "../shared/i18n.ts";
import { isRecord } from "../shared/json.ts";
import { postPreviewMessage, previewOverflowMessage, previewSettingsMessage } from "../shared/preview-messages.ts";
import { defaultSettings, readSettings, type SettingsSchema, type SettingsValues } from "../shared/settings.ts";
import type { MediaLibrary } from "./media-library.ts";
import { createSettingsForm } from "./settings-form.ts";

// Types
export interface OverlayEditorOptions<S extends SettingsSchema> {
  readonly container: HTMLElement;
  readonly title: string;
  readonly overlayId: string;
  readonly schema: S;
  readonly previewPath: string;
  readonly overlayPath: string;
  readonly media: MediaLibrary;
  readonly overlayHint?: string;
  readonly keepOnReset?: readonly (keyof S & string)[];
  readonly prepareSave?: (values: SettingsValues<S>) => SettingsValues<S> | string;
  readonly onSectionChange?: (section: string) => void;
}

export interface OverlayEditor {
  readonly frame: HTMLIFrameElement;
  readonly toolbar: HTMLElement;
  readonly actions: HTMLElement;
  setPreviewPath(path: string): void;
  showStatus(kind: StatusKind, message: string): void;
  refreshPreview(): void;
  activeSection(): string | null;
}

export type StatusKind = "" | "ok" | "error";

interface PreviewSize {
  readonly width: number;
  readonly height: number;
}

// Editor
export async function createOverlayEditor<S extends SettingsSchema>(options: OverlayEditorOptions<S>): Promise<OverlayEditor> {
  const { container, schema, overlayId } = options;
  const sourceUrl = createSourceUrl(options.overlayPath, `${overlayId}-url`);
  if (options.overlayHint !== undefined) {
    sourceUrl.append(element("p", "hint", t(options.overlayHint)));
  }
  const form = element("form", "editor-form");
  form.noValidate = true;
  const fields = element("div", "");
  const actions = element("div", "actions");
  const saveButton = element("button", "", t("editor.save"));
  saveButton.type = "submit";
  const resetButton = element("button", "secondary", t("editor.reset"));
  resetButton.type = "button";
  const status = element("p", "status");
  status.setAttribute("role", "status");
  actions.append(saveButton, resetButton, status);
  form.append(fields, actions);

  const toolbar = element("div", "preview-toolbar");
  toolbar.append(element("span", "muted", t("editor.preview")));
  const stage = element("div", "preview-stage");
  stage.dataset["background"] = "checkered";
  const frame = element("iframe", "");
  frame.title = t("editor.preview.title", { overlay: t(options.title) });
  stage.append(frame);
  for (const [value, label] of [
    ["checkered", "editor.background.checkered"],
    ["dark", "editor.background.dark"],
    ["light", "editor.background.light"],
  ] as const) {
    const chip = element("button", "chip", t(label));
    chip.type = "button";
    chip.dataset["previewBackground"] = value;
    chip.setAttribute("aria-pressed", String(value === "checkered"));
    chip.addEventListener("click", () => {
      stage.dataset["background"] = value;
      for (const other of toolbar.querySelectorAll("[data-preview-background]")) {
        other.setAttribute("aria-pressed", String(other === chip));
      }
    });
    toolbar.append(chip);
  }
  const overflowWarning = element("p", "hint warning", t("editor.overflow"));
  overflowWarning.hidden = true;
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source === frame.contentWindow && isRecord(event.data) && event.data["type"] === previewOverflowMessage) {
      overflowWarning.hidden = event.data["overflowing"] !== true;
    }
  });
  const previewColumn = element("div", "editor-preview");
  previewColumn.append(toolbar, stage, overflowWarning);
  const layout = element("div", "editor");
  layout.append(form, previewColumn);
  container.replaceChildren(sourceUrl, layout);

  let stored: ConfigSource = await fetchOverlaySettings(overlayId);
  let savedValues = JSON.stringify(readSettings(schema, stored));
  let previewScheduled = false;

  const showStatus = (kind: StatusKind, message: string): void => {
    status.className = `status ${kind}`.trim();
    status.textContent = message;
  };

  const settingsForm = createSettingsForm(schema, overlayId, () => {
    updateDirtyState();
    schedulePreview();
  }, { media: options.media, onSectionChange: options.onSectionChange });
  fields.replaceChildren(settingsForm.element);
  settingsForm.setValues(readSettings(schema, stored));

  const currentValues = (): SettingsValues<S> => readSettings(schema, settingsForm.values());

  const updateDirtyState = (): void => {
    const isDirty = JSON.stringify(currentValues()) !== savedValues;
    saveButton.disabled = !isDirty;
    if (isDirty) {
      showStatus("", t("editor.unsaved"));
    }
  };

  const updatePreview = (): void => {
    previewScheduled = false;
    const values = currentValues();
    const size = previewSize(values);
    if (stage.clientWidth === 0) {
      postPreviewMessage(frame, previewSettingsMessage, { settings: values });
      return;
    }
    const scale = Math.min(1, stage.clientWidth / size.width);
    frame.style.width = `${size.width}px`;
    frame.style.height = `${size.height}px`;
    frame.style.transform = `scale(${scale})`;
    stage.style.height = `${Math.ceil(size.height * scale)}px`;
    postPreviewMessage(frame, previewSettingsMessage, { settings: values });
  };

  const schedulePreview = (): void => {
    if (!previewScheduled) {
      previewScheduled = true;
      setTimeout(updatePreview, 0);
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const prepared = options.prepareSave?.(currentValues()) ?? currentValues();
    if (typeof prepared === "string") {
      showStatus("error", t(prepared));
      return;
    }
    const updated = { ...stored, ...prepared };
    saveOverlaySettings(overlayId, updated).then(
      () => {
        stored = updated;
        savedValues = JSON.stringify(readSettings(schema, stored));
        settingsForm.setValues(readSettings(schema, stored));
        saveButton.disabled = true;
        showStatus("ok", t("editor.saved"));
      },
      (error: unknown) => showStatus("error", t("editor.save_failed", { error: error instanceof Error ? error.message : String(error) })),
    );
  });

  resetButton.addEventListener("click", () => {
    const kept = Object.fromEntries((options.keepOnReset ?? []).map((key) => [key, currentValues()[key]]));
    settingsForm.setValues({ ...defaultSettings(schema), ...kept });
    updateDirtyState();
    schedulePreview();
  });

  frame.addEventListener("load", schedulePreview);
  new ResizeObserver(schedulePreview).observe(stage);
  frame.src = options.previewPath;
  saveButton.disabled = true;

  return {
    frame,
    toolbar,
    actions,
    setPreviewPath: (path) => (frame.src = path),
    showStatus,
    refreshPreview: schedulePreview,
    activeSection: () => settingsForm.activeSection(),
  };
}

function createSourceUrl(path: string, id: string): HTMLElement {
  const row = element("div", "source-url");
  const label = element("label", "", t("editor.url"));
  label.htmlFor = id;
  const url = element("input", "");
  url.id = id;
  url.readOnly = true;
  url.value = new URL(path, location.origin).href;
  url.title = t("editor.url.hint");
  url.addEventListener("focus", () => url.select());
  const copy = element("button", "secondary", t("editor.copy"));
  copy.type = "button";
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(url.value).then(() => {
      copy.textContent = t("editor.copied");
      setTimeout(() => (copy.textContent = t("editor.copy")), 1500);
    });
  });
  row.append(label, url, copy);
  return row;
}

function previewSize(values: Readonly<Record<string, unknown>>): PreviewSize {
  const width = typeof values["width"] === "number" ? values["width"] : 400;
  const height = typeof values["height"] === "number" ? values["height"] : 600;
  return { width, height };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  if (className !== "") {
    created.className = className;
  }
  if (text !== "") {
    created.textContent = text;
  }
  return created;
}
