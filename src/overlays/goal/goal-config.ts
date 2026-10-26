import { appearanceSettings, sizeSettings } from "../../shared/appearance.ts";
import type { ConfigSource } from "../../shared/config.ts";
import { choiceSetting, colorSetting, numberSetting, readSettings, textSetting, type SettingsSchema, type SettingsValues } from "../../shared/settings.ts";
import type { StreamStats } from "../../shared/stats.ts";

// Types
export type GoalKind = "followers" | "subs";

export interface GoalState {
  readonly title: string;
  readonly current: number | null;
  readonly target: number;
}

// Constants
export const goalOverlayId = "goals";
export const goalSections: Readonly<Record<GoalKind, string>> = { followers: "Follower goal", subs: "Sub goal" };
const generalSection = "General";

// Schema
export const goalSettings = {
  ...appearanceSettings(generalSection, 28),
  barColor: colorSetting({ label: "Bar color", group: "Bar", section: generalSection, default: "#775cff" }),
  barBackground: colorSetting({ label: "Bar background", group: "Bar", section: generalSection, default: "#00000080" }),
  barHeight: numberSetting({ label: "Bar height", group: "Bar", section: generalSection, default: 28, min: 4, max: 200, unit: "px" }),
  ...sizeSettings(generalSection, 600, 120),

  followersTitle: textSetting({ label: "Title", group: "Goal", section: goalSections.followers, default: "Follower goal", placeholder: "Follower goal" }),
  followersTarget: numberSetting({ label: "Target", group: "Goal", section: goalSections.followers, default: 100, min: 1, max: 100_000_000 }),

  subsTitle: textSetting({ label: "Title", group: "Goal", section: goalSections.subs, default: "Sub goal", placeholder: "Sub goal" }),
  subsTarget: numberSetting({ label: "Target", group: "Goal", section: goalSections.subs, default: 10, min: 1, max: 10_000_000 }),
  subsCount: choiceSetting({
    label: "Count",
    group: "Goal",
    section: goalSections.subs,
    hint: "Sub points count Tier 2 as 2 and Tier 3 as 6, like Twitch does.",
    default: "subscribers",
    options: [
      { value: "subscribers", label: "Subscribers" },
      { value: "points", label: "Sub points" },
    ],
  }),
} satisfies SettingsSchema;

export type GoalConfig = SettingsValues<typeof goalSettings>;

// Reading
export function readGoalConfig(source: ConfigSource): GoalConfig {
  return readSettings(goalSettings, source);
}

export function readGoalKind(value: string | undefined | null): GoalKind {
  return value === "subs" ? "subs" : "followers";
}

export function goalKindForSection(section: string | null): GoalKind {
  return section === goalSections.subs ? "subs" : "followers";
}

export function goalState(config: GoalConfig, kind: GoalKind, stats: StreamStats): GoalState {
  if (kind === "subs") {
    return {
      title: config.subsTitle,
      current: config.subsCount === "points" ? stats.subPoints : stats.subscribers,
      target: config.subsTarget,
    };
  }
  return { title: config.followersTitle, current: stats.followers, target: config.followersTarget };
}

export function goalProgress(state: GoalState): number {
  return state.current === null ? 0 : Math.min(1, Math.max(0, state.current / state.target));
}
