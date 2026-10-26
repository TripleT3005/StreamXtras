import type {
  BooleanSetting,
  ChoiceSetting,
  ColorSetting,
  FontSetting,
  ListSetting,
  MediaKind,
  MediaSetting,
  MultiChoiceSetting,
  NumberSetting,
  Setting,
  SettingsSchema,
  TextSetting,
} from "../shared/settings.ts";
import { isVideoReference, mediaUrl } from "../shared/config.ts";
import { defaultSettings } from "../shared/settings.ts";
import type { MediaLibrary } from "./media-library.ts";

// Types
interface LocalFontData {
  readonly family: string;
}

type WindowWithLocalFonts = Window & { queryLocalFonts?: () => Promise<readonly LocalFontData[]> };

export type FormValues = Readonly<Record<string, unknown>>;

export interface SettingsForm {
  readonly element: HTMLElement;
  values(): FormValues;
  setValues(values: FormValues): void;
  activeSection(): string | null;
}

interface SectionView {
  readonly tab: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly panel: HTMLElement;
}

interface Field {
  readonly element: HTMLElement;
  read(): unknown;
  write(value: unknown): void;
}

// Form
export interface FormContext {
  readonly media: MediaLibrary;
  readonly onSectionChange?: ((section: string) => void) | undefined;
}

export function createSettingsForm(schema: SettingsSchema, idPrefix: string, onChange: () => void, context: FormContext): SettingsForm {
  const element = document.createElement("div");
  element.className = "settings-form";
  const groups = new Map<string, HTMLFieldSetElement>();
  const fields = new Map<string, Field>();
  const sections = new Map<string, SectionView>();
  const sectionNav = document.createElement("div");
  sectionNav.className = "section-nav";
  sectionNav.setAttribute("role", "tablist");
  sectionNav.setAttribute("aria-orientation", "vertical");
  const sectionPanels = document.createElement("div");
  sectionPanels.className = "section-panels";
  let active: string | null = null;

  const selectSection = (name: string): void => {
    active = name;
    for (const [sectionName, view] of sections) {
      const isActive = sectionName === name;
      view.button.setAttribute("aria-selected", String(isActive));
      view.button.tabIndex = isActive ? 0 : -1;
      view.panel.hidden = !isActive;
    }
    context.onSectionChange?.(name);
  };

  const sectionFor = (name: string): SectionView => {
    const existing = sections.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const id = `${idPrefix}-section-${sections.size}`;
    const tab = document.createElement("div");
    tab.className = "section-tab";
    const sectionButton = button(name, "", () => selectSection(name));
    sectionButton.id = `${id}-tab`;
    sectionButton.setAttribute("role", "tab");
    sectionButton.setAttribute("aria-controls", `${id}-panel`);
    sectionButton.addEventListener("keydown", (event) => moveSectionFocus(event, [...sections.values()].map((view) => view.button)));
    tab.append(sectionButton);
    const panel = document.createElement("div");
    panel.id = `${id}-panel`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", sectionButton.id);
    const view = { tab, button: sectionButton, panel };
    sections.set(name, view);
    sectionNav.append(tab);
    sectionPanels.append(panel);
    if (sections.size === 1) {
      element.classList.add("sectioned");
      element.append(sectionNav, sectionPanels);
    }
    return view;
  };

  for (const [key, setting] of Object.entries(schema)) {
    const id = `${idPrefix}-${key}`;
    const section = setting.section === undefined ? null : sectionFor(setting.section);
    const isToggle = section !== null && setting.kind === "boolean" && setting.sectionToggle;
    const field = isToggle ? createSectionToggle(id, setting) : createField(id, setting, context);
    field.element.addEventListener("input", onChange);
    field.element.addEventListener("change", onChange);
    fields.set(key, field);
    if (isToggle) {
      section.tab.prepend(field.element);
      continue;
    }
    const groupKey = `${setting.section ?? ""}/${setting.group}`;
    let group = groups.get(groupKey);
    if (group === undefined) {
      group = document.createElement("fieldset");
      group.className = "settings-group";
      if (setting.group !== "") {
        const legend = document.createElement("legend");
        legend.textContent = setting.group;
        group.append(legend);
      }
      groups.set(groupKey, group);
      (section?.panel ?? element).append(group);
    }
    group.append(field.element);
  }

  const first = sections.keys().next();
  if (first.done !== true) {
    selectSection(first.value);
  }

  return {
    element,
    values: () => Object.fromEntries([...fields].map(([key, field]) => [key, field.read()])),
    setValues: (values) => {
      for (const [key, field] of fields) {
        field.write(values[key]);
      }
    },
    activeSection: () => active,
  };
}

function moveSectionFocus(event: KeyboardEvent, buttons: readonly HTMLButtonElement[]): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  event.preventDefault();
  const index = buttons.findIndex((candidate) => candidate === event.currentTarget);
  const next = buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length];
  next?.focus();
  next?.click();
}

function createSectionToggle(id: string, setting: BooleanSetting): Field {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.setAttribute("aria-label", `Show ${setting.label.toLowerCase()}`);
  input.title = `Show ${setting.label.toLowerCase()}`;
  return {
    element: input,
    read: () => input.checked,
    write: (value) => (input.checked = value === true),
  };
}

function createField(id: string, setting: Setting, context: FormContext): Field {
  switch (setting.kind) {
    case "list":
      return createListField(id, setting, context);
    case "text":
      return createTextField(id, setting);
    case "font":
      return createFontField(id, setting);
    case "number":
      return createNumberField(id, setting);
    case "boolean":
      return createBooleanField(id, setting);
    case "choice":
      return createChoiceField(id, setting);
    case "multi-choice":
      return createMultiChoiceField(id, setting);
    case "color":
      return createColorField(id, setting);
    case "media":
      return createMediaField(id, setting, context.media);
  }
}

// Fields
function createListField(id: string, setting: ListSetting, context: FormContext): Field {
  interface Entry {
    readonly element: HTMLElement;
    readonly form: SettingsForm;
    readonly title: HTMLElement;
    readonly up: HTMLButtonElement;
    readonly down: HTMLButtonElement;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "field list";
  appendHint(wrapper, setting.hint);
  const items = document.createElement("div");
  items.className = "list-items";
  let entries: Entry[] = [];
  let created = 0;

  const changed = (): void => {
    wrapper.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const render = (): void => {
    entries.forEach((entry, index) => {
      entry.title.textContent = `${setting.itemLabel} ${index + 1}`;
      entry.up.disabled = index === 0;
      entry.down.disabled = index === entries.length - 1;
    });
    items.replaceChildren(...entries.map((entry) => entry.element));
    add.hidden = entries.length >= setting.maxItems;
  };

  const move = (entry: Entry, offset: number): void => {
    const index = entries.indexOf(entry);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= entries.length) {
      return;
    }
    entries.splice(index, 1);
    entries.splice(target, 0, entry);
    render();
    changed();
  };

  const createEntry = (values: FormValues): Entry => {
    created += 1;
    const element = document.createElement("div");
    element.className = "list-item";
    const header = document.createElement("div");
    header.className = "list-item-header";
    const title = document.createElement("span");
    title.className = "list-item-title";
    const form = createSettingsForm(setting.itemSchema, `${id}-${created}`, () => undefined, context);
    form.setValues(values);
    const up = button("\u2191", "secondary icon", () => move(entry, -1));
    up.setAttribute("aria-label", "Move up");
    up.title = "Move up";
    const down = button("\u2193", "secondary icon", () => move(entry, 1));
    down.setAttribute("aria-label", "Move down");
    down.title = "Move down";
    const remove = button("Remove", "secondary", () => {
      entries = entries.filter((candidate) => candidate !== entry);
      render();
      changed();
    });
    const entry: Entry = { element, form, title, up, down };
    header.append(title, up, down, remove);
    element.append(header, form.element);
    return entry;
  };

  const add = button(`Add ${setting.itemLabel.toLowerCase()}`, "secondary", () => {
    entries.push(createEntry(defaultSettings(setting.itemSchema)));
    render();
    changed();
    entries.at(-1)?.element.querySelector<HTMLElement>("select, input")?.focus();
  });
  wrapper.append(items, add);

  return {
    element: wrapper,
    read: () => entries.map((entry) => entry.form.values()),
    write: (value) => {
      entries = (Array.isArray(value) ? value : []).filter((item): item is FormValues => typeof item === "object" && item !== null).map(createEntry);
      render();
    },
  };
}

function createTextField(id: string, setting: TextSetting): Field {
  const { wrapper, control } = createLabeledField(id, setting);
  const input = document.createElement("input");
  input.id = id;
  input.placeholder = setting.placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;
  if (setting.suggestions.length > 0) {
    const list = document.createElement("datalist");
    list.id = `${id}-suggestions`;
    list.append(...setting.suggestions.map((suggestion) => new Option(suggestion)));
    input.setAttribute("list", list.id);
    control.append(list);
  }
  control.prepend(input);
  return {
    element: wrapper,
    read: () => input.value.trim(),
    write: (value) => (input.value = typeof value === "string" ? value : ""),
  };
}

function createFontField(id: string, setting: FontSetting): Field {
  const { wrapper, control } = createLabeledField(id, setting);
  const customValue = "__custom__";
  const select = document.createElement("select");
  select.id = id;
  const custom = document.createElement("input");
  custom.placeholder = "Font name";
  custom.autocomplete = "off";
  custom.spellcheck = false;
  custom.setAttribute("aria-label", `${setting.label} name`);
  custom.hidden = true;

  let fonts: readonly string[] = setting.suggestions;
  const renderOptions = (selected: string): void => {
    const options = [new Option("System font", ""), ...fonts.map((font) => fontOption(font)), new Option("Other…", customValue)];
    select.replaceChildren(...options);
    const isListed = selected === "" || fonts.includes(selected);
    select.value = isListed ? selected : customValue;
    custom.hidden = isListed;
    custom.value = isListed ? "" : selected;
  };
  const read = (): string => (select.value === customValue ? custom.value.trim() : select.value);

  select.addEventListener("change", () => {
    custom.hidden = select.value !== customValue;
    if (!custom.hidden) {
      custom.focus();
    }
  });
  control.append(select);

  const queryLocalFonts = (window as WindowWithLocalFonts).queryLocalFonts;
  if (queryLocalFonts !== undefined) {
    const load = document.createElement("button");
    load.type = "button";
    load.className = "secondary";
    load.textContent = "Installed fonts";
    load.title = "Lists the fonts installed on this computer. The browser asks for permission once.";
    load.addEventListener("click", () => {
      queryLocalFonts.call(window).then(
        (installed) => {
          fonts = [...new Set(installed.map((font) => font.family))].sort((first, second) => first.localeCompare(second));
          renderOptions(read());
          load.remove();
        },
        () => (load.textContent = "Not allowed"),
      );
    });
    control.append(load);
  }
  wrapper.insertBefore(custom, control.nextSibling);
  renderOptions(setting.default);

  return {
    element: wrapper,
    read,
    write: (value) => renderOptions(typeof value === "string" ? value : setting.default),
  };
}

function fontOption(font: string): HTMLOptionElement {
  const option = new Option(font, font);
  option.style.fontFamily = `"${font.replace(/["\\]/g, "")}", system-ui`;
  return option;
}

function createNumberField(id: string, setting: NumberSetting): Field {
  const { wrapper, control } = createLabeledField(id, setting);
  const range = document.createElement("input");
  const number = document.createElement("input");
  for (const input of [range, number]) {
    input.min = String(setting.min);
    input.max = String(setting.max);
    input.step = String(setting.step);
  }
  range.type = "range";
  range.setAttribute("aria-label", setting.label);
  range.tabIndex = -1;
  number.type = "number";
  number.id = id;
  number.className = "number";
  range.addEventListener("input", () => (number.value = range.value));
  number.addEventListener("input", () => (range.value = number.value));
  control.append(range, number);
  if (setting.unit !== "") {
    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = setting.unit;
    control.append(unit);
  }
  return {
    element: wrapper,
    read: () => clamp(Math.round(Number(number.value)), setting.min, setting.max, setting.default),
    write: (value) => {
      const text = String(typeof value === "number" ? value : setting.default);
      number.value = text;
      range.value = text;
    },
  };
}

function createBooleanField(id: string, setting: BooleanSetting): Field {
  const wrapper = document.createElement("div");
  wrapper.className = "field checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = setting.label;
  wrapper.append(input, label);
  appendHint(wrapper, setting.hint);
  return {
    element: wrapper,
    read: () => input.checked,
    write: (value) => (input.checked = value === true),
  };
}

function createChoiceField(id: string, setting: ChoiceSetting): Field {
  const { wrapper, control } = createLabeledField(id, setting);
  const select = document.createElement("select");
  select.id = id;
  select.append(...setting.options.map((option) => new Option(option.label, option.value)));
  control.append(select);
  return {
    element: wrapper,
    read: () => select.value,
    write: (value) => (select.value = typeof value === "string" ? value : setting.default),
  };
}

function createMultiChoiceField(id: string, setting: MultiChoiceSetting): Field {
  const wrapper = document.createElement("fieldset");
  wrapper.className = "field choices";
  const legend = document.createElement("legend");
  legend.textContent = setting.label;
  wrapper.append(legend);
  const inputs = setting.options.map((option) => {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `${id}-${option.value}`;
    input.value = option.value;
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = option.label;
    const item = document.createElement("span");
    item.className = "choice";
    item.append(input, label);
    wrapper.append(item);
    return input;
  });
  appendHint(wrapper, setting.hint);
  return {
    element: wrapper,
    read: () => inputs.filter((input) => input.checked).map((input) => input.value),
    write: (value) => {
      const selected = Array.isArray(value) ? value : [];
      for (const input of inputs) {
        input.checked = selected.includes(input.value);
      }
    },
  };
}

function createColorField(id: string, setting: ColorSetting): Field {
  const { wrapper, control } = createLabeledField(id, setting);
  const color = document.createElement("input");
  color.type = "color";
  color.id = id;
  const opacity = document.createElement("input");
  opacity.type = "range";
  opacity.min = "0";
  opacity.max = "100";
  opacity.setAttribute("aria-label", `${setting.label} opacity`);
  const output = document.createElement("span");
  output.className = "unit";
  const updateOutput = (): void => {
    output.textContent = `${opacity.value}%`;
  };
  opacity.addEventListener("input", updateOutput);
  control.append(color, opacity, output);
  return {
    element: wrapper,
    read: () => `${color.value}${Math.round((Number(opacity.value) / 100) * 255).toString(16).padStart(2, "0")}`,
    write: (value) => {
      const text = typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value) ? value : setting.default;
      color.value = text.slice(0, 7);
      opacity.value = String(text.length === 9 ? Math.round((parseInt(text.slice(7), 16) / 255) * 100) : 100);
      updateOutput();
    },
  };
}

function createMediaField(id: string, setting: MediaSetting, media: MediaLibrary): Field {
  const { wrapper, control } = createLabeledField(id, setting);
  const select = document.createElement("select");
  select.id = id;
  const upload = document.createElement("input");
  upload.type = "file";
  upload.hidden = true;
  upload.accept = setting.accepts.map((kind) => uploadTypes[kind]).join(",");
  const uploadButton = button("Upload…", "secondary", () => upload.click());
  uploadButton.title = "Up to 50 MB";
  const deleteButton = button("Delete file", "secondary", () => void removeCurrent());
  const status = document.createElement("p");
  status.className = "hint";
  const shows = (kind: MediaKind): boolean => setting.accepts.includes(kind);
  const preview = shows("image") ? document.createElement("img") : null;
  if (preview !== null) {
    preview.className = "media-thumbnail";
    preview.alt = "";
  }
  const videoPreview = shows("video") ? document.createElement("video") : null;
  if (videoPreview !== null) {
    videoPreview.className = "media-thumbnail";
    videoPreview.muted = true;
    videoPreview.preload = "metadata";
  }
  const play = shows("sound") ? button("Play", "secondary", () => playCurrent()) : null;

  let current = setting.default;

  const renderOptions = (): void => {
    const included = optionGroup("Included", setting.builtIns.map((option) => new Option(option.label, option.value)));
    const uploaded = media.files.filter((file) => shows(file.kind));
    const own = optionGroup("Your files", uploaded.map((file) => new Option(file.file, file.value)));
    const isKnown = current === "" || setting.builtIns.some((option) => option.value === current) || uploaded.some((file) => file.value === current);
    const missing = isKnown ? [] : [new Option(`Missing file (${current})`, current)];
    select.replaceChildren(new Option("None", ""), included, ...(own.children.length > 0 ? [own] : []), ...missing);
    select.value = current;
    updateControls();
  };

  const updateControls = (): void => {
    const url = mediaUrl(current);
    deleteButton.hidden = !current.startsWith("media/");
    const isVideo = isVideoReference(current);
    if (preview !== null) {
      preview.hidden = url === null || isVideo;
      if (url !== null && !isVideo) {
        preview.src = url;
      }
    }
    if (videoPreview !== null) {
      videoPreview.hidden = url === null || !isVideo;
      if (url !== null && isVideo && !videoPreview.src.endsWith(url)) {
        videoPreview.src = url;
      }
    }
    if (play !== null) {
      play.disabled = url === null;
    }
  };

  const changed = (): void => {
    updateControls();
    wrapper.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const playCurrent = (): void => {
    const url = mediaUrl(current);
    if (url !== null) {
      const audio = new Audio(url);
      audio.volume = 0.7;
      void audio.play().catch(() => (status.textContent = "Playing the sound failed."));
    }
  };

  const removeCurrent = async (): Promise<void> => {
    const file = current.slice("media/".length);
    try {
      await media.remove(file);
      current = setting.default;
      renderOptions();
      changed();
      status.textContent = "File deleted.";
    } catch (error: unknown) {
      status.textContent = `Deleting failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  const knownValues = (): readonly string[] => [
    "",
    current,
    ...setting.builtIns.map((option) => option.value),
    ...media.files.filter((file) => shows(file.kind)).map((file) => file.value),
  ];

  select.addEventListener("change", () => {
    current = knownValues().find((value) => value === select.value) ?? current;
    status.textContent = "";
    updateControls();
  });
  upload.addEventListener("change", () => {
    const file = upload.files?.[0];
    upload.value = "";
    if (file === undefined) {
      return;
    }
    status.textContent = "Uploading…";
    media.upload(file).then(
      (stored) => {
        current = stored.value;
        renderOptions();
        changed();
        status.textContent = "Uploaded.";
      },
      (error: unknown) => (status.textContent = `Upload failed: ${error instanceof Error ? error.message : String(error)}`),
    );
  });
  let wasConnected = false;
  const unsubscribe = media.subscribe(() => {
    if (wasConnected && !wrapper.isConnected) {
      unsubscribe();
      return;
    }
    wasConnected ||= wrapper.isConnected;
    renderOptions();
  });

  control.append(select, uploadButton, ...(play === null ? [] : [play]), deleteButton, upload);
  for (const thumbnail of [videoPreview, preview]) {
    if (thumbnail !== null) {
      wrapper.insertBefore(thumbnail, control.nextSibling);
    }
  }
  wrapper.append(status);
  renderOptions();

  return {
    element: wrapper,
    read: () => current,
    write: (value) => {
      current = typeof value === "string" ? value : setting.default;
      renderOptions();
    },
  };
}

const uploadTypes: Readonly<Record<MediaKind, string>> = {
  sound: ".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav",
  image: ".png,.gif,.webp,.jpg,.jpeg,image/png,image/gif,image/webp,image/jpeg",
  video: ".mp4,.webm,video/mp4,video/webm",
};

function optionGroup(label: string, options: readonly HTMLOptionElement[]): HTMLOptGroupElement {
  const group = document.createElement("optgroup");
  group.label = label;
  group.append(...options);
  return group;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

// Helpers
function createLabeledField(id: string, setting: Setting): { wrapper: HTMLDivElement; control: HTMLDivElement } {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = setting.label;
  const control = document.createElement("div");
  control.className = "control";
  wrapper.append(label, control);
  appendHint(wrapper, setting.hint);
  return { wrapper, control };
}

function appendHint(wrapper: HTMLElement, hint: string | undefined): void {
  if (hint !== undefined) {
    const paragraph = document.createElement("p");
    paragraph.className = "hint";
    paragraph.textContent = hint;
    wrapper.append(paragraph);
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
