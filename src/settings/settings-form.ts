import type {
  BooleanSetting,
  ChoiceSetting,
  ColorSetting,
  FontSetting,
  MediaSetting,
  MultiChoiceSetting,
  NumberSetting,
  Setting,
  SettingsSchema,
  TextSetting,
} from "../shared/settings.ts";
import { mediaUrl } from "../shared/config.ts";
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
}

interface Field {
  readonly element: HTMLElement;
  read(): unknown;
  write(value: unknown): void;
}

// Form
export interface FormContext {
  readonly media: MediaLibrary;
}

export function createSettingsForm(schema: SettingsSchema, idPrefix: string, onChange: () => void, context: FormContext): SettingsForm {
  const element = document.createElement("div");
  element.className = "settings-form";
  const groups = new Map<string, HTMLFieldSetElement>();
  const fields = new Map<string, Field>();

  for (const [key, setting] of Object.entries(schema)) {
    let group = groups.get(setting.group);
    if (group === undefined) {
      group = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = setting.group;
      group.append(legend);
      groups.set(setting.group, group);
      element.append(group);
    }
    const field = createField(`${idPrefix}-${key}`, setting, context);
    field.element.addEventListener("input", onChange);
    field.element.addEventListener("change", onChange);
    group.append(field.element);
    fields.set(key, field);
  }

  return {
    element,
    values: () => Object.fromEntries([...fields].map(([key, field]) => [key, field.read()])),
    setValues: (values) => {
      for (const [key, field] of fields) {
        field.write(values[key]);
      }
    },
  };
}

function createField(id: string, setting: Setting, context: FormContext): Field {
  switch (setting.kind) {
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
  upload.accept = setting.mediaKind === "sound" ? ".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav" : ".png,.gif,.webp,.jpg,.jpeg,image/png,image/gif,image/webp,image/jpeg";
  const uploadButton = button("Upload…", "secondary", () => upload.click());
  const deleteButton = button("Delete file", "secondary", () => void removeCurrent());
  const status = document.createElement("p");
  status.className = "hint";
  const preview = setting.mediaKind === "image" ? document.createElement("img") : null;
  if (preview !== null) {
    preview.className = "media-thumbnail";
    preview.alt = "";
  }
  const play = setting.mediaKind === "sound" ? button("Play", "secondary", () => playCurrent()) : null;

  let current = setting.default;

  const renderOptions = (): void => {
    const included = optionGroup("Included", setting.builtIns.map((option) => new Option(option.label, option.value)));
    const uploaded = media.files.filter((file) => file.kind === setting.mediaKind);
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
    if (preview !== null) {
      preview.hidden = url === null;
      if (url !== null) {
        preview.src = url;
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

  select.addEventListener("change", () => {
    current = select.value;
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
  media.subscribe(renderOptions);

  control.append(select, uploadButton, ...(play === null ? [] : [play]), deleteButton, upload);
  if (preview !== null) {
    wrapper.insertBefore(preview, control.nextSibling);
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
