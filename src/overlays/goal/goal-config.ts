import { appearanceSettings, sizeSettings } from "../../shared/appearance.ts";
import type { ConfigSource } from "../../shared/config.ts";
import {
  choiceSetting,
  colorSetting,
  generalSection,
  numberSetting,
  readSettings,
  textSetting,
  type SettingsSchema,
  type SettingsValues,
} from "../../shared/settings.ts";
import type { StreamStats, TwitchGoal } from "../../shared/stats.ts";

// Types
export type GoalKind = "followers" | "subs";

export interface GoalState {
  readonly title: string;
  readonly current: number | null;
  readonly target: number;
}

// Constants
export const goalOverlayId = "goals";
export const goalSections: Readonly<Record<GoalKind, string>> = { followers: "goal.followers", subs: "goal.subs" };
const twitchGoalTypes: Readonly<Record<GoalKind, readonly string[]>> = {
  followers: ["follower"],
  subs: ["subscription", "subscription_count", "new_subscription", "new_subscription_count"],
};

function sourceSetting(section: string, hint: string) {
  return choiceSetting({
    label: "goal.source",
    group: "group.goal",
    section,
    hint,
    default: "here",
    options: [
      { value: "here", label: "goal.source.here" },
      { value: "twitch", label: "Twitch" },
    ],
  });
}

// Schema
export const goalSettings = {
  ...appearanceSettings(generalSection, 28),
  barColor: colorSetting({ label: "goal.bar_color", group: "group.bar", section: generalSection, default: "#775cff" }),
  barBackground: colorSetting({ label: "goal.bar_background", group: "group.bar", section: generalSection, default: "#00000080" }),
  barHeight: numberSetting({ label: "goal.bar_height", group: "group.bar", section: generalSection, default: 28, min: 4, max: 200, unit: "px" }),
  ...sizeSettings(generalSection, 600, 120),

  followersSource: sourceSetting(goalSections.followers, "goal.followers.source_hint"),
  followersTitle: textSetting({ label: "setting.title", group: "group.goal", section: goalSections.followers, default: "Follower goal", placeholder: "Follower goal" }),
  followersTarget: numberSetting({ label: "goal.target", group: "group.goal", section: goalSections.followers, default: 100, min: 1, max: 100_000_000 }),

  subsSource: sourceSetting(goalSections.subs, "goal.subs.source_hint"),
  subsTitle: textSetting({ label: "setting.title", group: "group.goal", section: goalSections.subs, default: "Sub goal", placeholder: "Sub goal" }),
  subsTarget: numberSetting({ label: "goal.target", group: "group.goal", section: goalSections.subs, default: 10, min: 1, max: 10_000_000 }),
  subsCount: choiceSetting({
    label: "goal.count",
    group: "group.goal",
    section: goalSections.subs,
    hint: "goal.count.hint",
    default: "subscribers",
    options: [
      { value: "subscribers", label: "goal.count.subscribers" },
      { value: "points", label: "goal.count.points" },
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

export function goalState(config: GoalConfig, kind: GoalKind, stats: StreamStats): GoalState | null {
  if (config[`${kind}Source`] === "twitch") {
    const goal = activeTwitchGoal(kind, stats.goals);
    return goal === undefined ? null : { title: goal.description || config[`${kind}Title`], current: goal.current, target: goal.target };
  }
  if (kind === "subs") {
    return {
      title: config.subsTitle,
      current: config.subsCount === "points" ? stats.subPoints : stats.subscribers,
      target: config.subsTarget,
    };
  }
  return { title: config.followersTitle, current: stats.followers, target: config.followersTarget };
}

export function activeTwitchGoal(kind: GoalKind, goals: readonly TwitchGoal[]): TwitchGoal | undefined {
  return goals.find((goal) => twitchGoalTypes[kind].includes(goal.type));
}

export function goalProgress(state: GoalState): number {
  return state.current === null ? 0 : Math.min(1, Math.max(0, state.current / state.target));
}
