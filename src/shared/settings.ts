import { readBoolean, readColor, readInteger, readMediaReference, readString, readStringList, type ConfigSource } from "./config.ts";
import { isRecord } from "./json.ts";

// Types
interface SettingBase<T> {
  readonly label: string;
  readonly group: string;
  readonly section?: string | undefined;
  readonly hint?: string;
  readonly default: T;
  readonly live: boolean;
  read(source: ConfigSource, key: string): T;
}

export interface TextSetting extends SettingBase<string> {
  readonly kind: "text";
  readonly placeholder: string;
  readonly suggestions: readonly string[];
}

export interface FontSetting extends SettingBase<string> {
  readonly kind: "font";
  readonly suggestions: readonly string[];
}

export interface NumberSetting extends SettingBase<number> {
  readonly kind: "number";
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
}

export interface BooleanSetting extends SettingBase<boolean> {
  readonly kind: "boolean";
  readonly sectionToggle: boolean;
}

export type MediaKind = "sound" | "image" | "video";

export interface MediaSetting extends SettingBase<string> {
  readonly kind: "media";
  readonly accepts: readonly MediaKind[];
  readonly builtIns: readonly SettingOption<string>[];
}

export interface ColorSetting extends SettingBase<string> {
  readonly kind: "color";
}

export interface SettingOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface ChoiceSetting<T extends string = string> extends SettingBase<T> {
  readonly kind: "choice";
  readonly options: readonly SettingOption<T>[];
}

export interface MultiChoiceSetting<T extends string = string> extends SettingBase<readonly T[]> {
  readonly kind: "multi-choice";
  readonly options: readonly SettingOption<T>[];
}

export interface ListSetting<S extends SettingsSchema = SettingsSchema> extends SettingBase<readonly SettingsValues<S>[]> {
  readonly kind: "list";
  readonly itemSchema: S;
  readonly itemLabel: string;
  readonly maxItems: number;
}

export type Setting =
  | ListSetting
  | TextSetting
  | FontSetting
  | NumberSetting
  | BooleanSetting
  | ColorSetting
  | MediaSetting
  | ChoiceSetting
  | MultiChoiceSetting;

export type SettingsSchema = Readonly<Record<string, Setting>>;

export type SettingsValues<S extends SettingsSchema> = { readonly [K in keyof S]: S[K]["default"] };

interface CommonOptions<T> {
  readonly label: string;
  readonly group: string;
  readonly section?: string | undefined;
  readonly hint?: string;
  readonly default: T;
  readonly live?: boolean;
}

// Factories
export function textSetting(options: CommonOptions<string> & { readonly placeholder?: string; readonly suggestions?: readonly string[] }): TextSetting {
  return {
    ...options,
    kind: "text",
    live: options.live ?? true,
    placeholder: options.placeholder ?? "",
    suggestions: options.suggestions ?? [],
    read: (source, key) => readString(source, key, options.default),
  };
}

export function fontSetting(options: CommonOptions<string> & { readonly suggestions?: readonly string[] }): FontSetting {
  return {
    ...options,
    kind: "font",
    live: options.live ?? true,
    suggestions: options.suggestions ?? [],
    read: (source, key) => readString(source, key, options.default),
  };
}

export function numberSetting(
  options: CommonOptions<number> & { readonly min: number; readonly max: number; readonly step?: number; readonly unit?: string },
): NumberSetting {
  return {
    ...options,
    kind: "number",
    live: options.live ?? true,
    step: options.step ?? 1,
    unit: options.unit ?? "",
    read: (source, key) => readInteger(source, key, options.default, options.min, options.max),
  };
}

export function booleanSetting(options: CommonOptions<boolean> & { readonly sectionToggle?: boolean }): BooleanSetting {
  return {
    ...options,
    kind: "boolean",
    live: options.live ?? true,
    sectionToggle: options.sectionToggle ?? false,
    read: (source, key) => readBoolean(source, key, options.default),
  };
}

export function colorSetting(options: CommonOptions<string>): ColorSetting {
  return { ...options, kind: "color", live: options.live ?? true, read: (source, key) => readColor(source, key, options.default) };
}

export function mediaSetting(
  options: CommonOptions<string> & { readonly accepts: readonly MediaKind[]; readonly builtIns: readonly SettingOption<string>[] },
): MediaSetting {
  return { ...options, kind: "media", live: options.live ?? true, read: (source, key) => readMediaReference(source, key, options.default) };
}

export function choiceSetting<T extends string>(options: CommonOptions<T> & { readonly options: readonly SettingOption<T>[] }): ChoiceSetting<T> {
  return {
    ...options,
    kind: "choice",
    live: options.live ?? true,
    read: (source, key) => {
      const value = readString(source, key, options.default);
      return options.options.find((option) => option.value === value)?.value ?? options.default;
    },
  };
}

export function multiChoiceSetting<T extends string>(
  options: CommonOptions<readonly T[]> & { readonly options: readonly SettingOption<T>[] },
): MultiChoiceSetting<T> {
  return {
    ...options,
    kind: "multi-choice",
    live: options.live ?? true,
    read: (source, key) => {
      const values = readStringList(source, key, options.default);
      return options.options.filter((option) => values.includes(option.value)).map((option) => option.value);
    },
  };
}

export function listSetting<S extends SettingsSchema>(
  options: CommonOptions<readonly SettingsValues<S>[]> & { readonly itemSchema: S; readonly itemLabel: string; readonly maxItems: number },
): ListSetting<S> {
  return {
    ...options,
    kind: "list",
    live: options.live ?? true,
    read: (source, key) => {
      const value = source[key];
      if (!Array.isArray(value)) {
        return options.default;
      }
      return value
        .filter(isRecord)
        .slice(0, options.maxItems)
        .map((item) => readSettings(options.itemSchema, item));
    },
  };
}

// Reading
export function readSettings<S extends SettingsSchema>(schema: S, source: ConfigSource): SettingsValues<S> {
  return Object.fromEntries(Object.entries(schema).map(([key, setting]) => [key, setting.read(source, key)])) as SettingsValues<S>;
}

export function defaultSettings<S extends SettingsSchema>(schema: S): SettingsValues<S> {
  return Object.fromEntries(Object.entries(schema).map(([key, setting]) => [key, setting.default])) as SettingsValues<S>;
}

export function hasStructuralChange<S extends SettingsSchema>(schema: S, previous: SettingsValues<S>, next: SettingsValues<S>): boolean {
  return Object.entries(schema).some(([key, setting]) => !setting.live && !isSameValue(previous[key], next[key]));
}

function isSameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}
