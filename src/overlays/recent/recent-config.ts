import type { AlertType } from "../../shared/alerts.ts";
import { appearanceSettings, sizeSettings } from "../../shared/appearance.ts";
import type { ConfigSource } from "../../shared/config.ts";
import { choiceSetting, numberSetting, prefixed, readSettings, textSetting, type SettingsSchema, type SettingsValues } from "../../shared/settings.ts";

// Types
interface RecentTypeDefinition {
  readonly label: string;
  readonly title: string;
  readonly item: string;
  readonly hint: string;
}

// Constants
export const recentOverlayId = "recent";
const generalSection = "General";
const nameHint = "{name} is replaced with the name.";

export const recentTypeDefinitions: Readonly<Record<AlertType, RecentTypeDefinition>> = {
  follow: { label: "Followers", title: "Latest followers", item: "{name}", hint: nameHint },
  sub: { label: "Subscriptions", title: "Latest subs", item: "{name} ({tier})", hint: `${nameHint} {amount} with the months, {tier} with the tier.` },
  gift: { label: "Gift subs", title: "Latest gift subs", item: "{name} ({amount})", hint: `${nameHint} {amount} with the number of gifted subs.` },
  cheer: { label: "Cheers", title: "Latest cheers", item: "{name} ({amount})", hint: `${nameHint} {amount} with the bits.` },
  raid: { label: "Raids", title: "Latest raids", item: "{name} ({amount})", hint: `${nameHint} {amount} with the viewers.` },
};

// Schema
function recentTypeSettings<T extends AlertType>(type: T) {
  const definition = recentTypeDefinitions[type];
  const section = definition.label;
  return prefixed(type, {
    title: textSetting({ label: "Title", group: "Events", section, hint: "Leave empty to hide the title.", default: definition.title }),
    count: numberSetting({ label: "Number of entries", group: "Events", section, default: 1, min: 1, max: 10 }),
    item: textSetting({ label: "Entry", group: "Events", section, hint: definition.hint, default: definition.item, placeholder: definition.item }),
  });
}

export const recentSettings = {
  ...appearanceSettings(generalSection, 24),
  layout: choiceSetting({
    label: "Layout",
    group: "Layout",
    section: generalSection,
    default: "list",
    options: [
      { value: "list", label: "One entry per line" },
      { value: "line", label: "All entries in one line" },
    ],
  }),
  emptyText: textSetting({ label: "Text without entries", group: "Layout", section: generalSection, default: "", placeholder: "Nobody yet" }),
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
  const entry = Object.entries(recentTypeDefinitions).find(([, definition]) => definition.label === section);
  return (entry?.[0] as AlertType | undefined) ?? "follow";
}
