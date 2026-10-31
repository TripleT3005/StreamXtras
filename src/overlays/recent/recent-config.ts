import type { AlertType } from "../../shared/alerts.ts";
import { appearanceSettings, sizeSettings } from "../../shared/appearance.ts";
import type { ConfigSource } from "../../shared/config.ts";
import {
  choiceSetting,
  generalSection,
  numberSetting,
  prefixed,
  readSettings,
  textSetting,
  type SettingsSchema,
  type SettingsValues,
} from "../../shared/settings.ts";

// Types
interface RecentTypeDefinition {
  readonly section: string;
  readonly title: string;
  readonly item: string;
  readonly hint: string;
}

// Constants
export const recentOverlayId = "recent";
export const recentTypeDefinitions: Readonly<Record<AlertType, RecentTypeDefinition>> = {
  follow: { section: "recent.follow", title: "Latest followers", item: "{name}", hint: "recent.follow.item_hint" },
  sub: { section: "recent.sub", title: "Latest subs", item: "{name} ({tier})", hint: "recent.sub.item_hint" },
  gift: { section: "recent.gift", title: "Latest gift subs", item: "{name} ({amount})", hint: "recent.gift.item_hint" },
  cheer: { section: "recent.cheer", title: "Latest cheers", item: "{name} ({amount})", hint: "recent.cheer.item_hint" },
  raid: { section: "recent.raid", title: "Latest raids", item: "{name} ({amount})", hint: "recent.raid.item_hint" },
};

// Schema
function recentTypeSettings<T extends AlertType>(type: T) {
  const definition = recentTypeDefinitions[type];
  const { section } = definition;
  return prefixed(type, {
    title: textSetting({ label: "setting.title", group: "group.events", section, hint: "setting.title.hint", default: definition.title }),
    count: numberSetting({ label: "recent.count", group: "group.events", section, default: 1, min: 1, max: 10 }),
    item: textSetting({ label: "recent.item", group: "group.events", section, hint: definition.hint, default: definition.item, placeholder: definition.item }),
  });
}

export const recentSettings = {
  ...appearanceSettings(generalSection, 24),
  layout: choiceSetting({
    label: "setting.layout",
    group: "group.layout",
    section: generalSection,
    default: "list",
    options: [
      { value: "list", label: "recent.layout.list" },
      { value: "line", label: "recent.layout.line" },
    ],
  }),
  emptyText: textSetting({
    label: "recent.empty_text",
    group: "group.layout",
    section: generalSection,
    default: "",
    placeholder: "recent.empty_text.placeholder",
  }),
  ...sizeSettings(generalSection, 400, 320),
  ...recentTypeSettings("follow"),
  ...recentTypeSettings("sub"),
  ...recentTypeSettings("gift"),
  ...recentTypeSettings("cheer"),
  ...recentTypeSettings("raid"),
} satisfies SettingsSchema;

export type RecentConfig = SettingsValues<typeof recentSettings>;

// Reading
export function readRecentConfig(source: ConfigSource): RecentConfig {
  return readSettings(recentSettings, source);
}

export function recentTypeForSection(section: string | null): AlertType {
  const entry = Object.entries(recentTypeDefinitions).find(([, definition]) => definition.section === section);
  return (entry?.[0] as AlertType | undefined) ?? "follow";
}
