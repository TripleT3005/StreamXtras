import { applyAppearance } from "../../shared/appearance.ts";
import { fetchOverlaySettings, subscribeToSettings } from "../../shared/config.ts";
import { isRecord } from "../../shared/json.ts";
import { onPreviewMessage, previewSettingsMessage, reportPreviewOverflow } from "../../shared/preview-messages.ts";
import { fetchStats, parseStats, subscribeToStats, type StreamStats } from "../../shared/stats.ts";
import { goalOverlayId, goalProgress, goalState, readGoalConfig, readGoalKind, type GoalConfig, type GoalKind } from "./goal-config.ts";

// Rendering
function render(root: HTMLElement, config: GoalConfig, kind: GoalKind, stats: StreamStats): void {
  applyAppearance(root, config);
  root.style.setProperty("--bar-color", config.barColor);
  root.style.setProperty("--bar-background", config.barBackground);
  root.style.setProperty("--bar-height", `${config.barHeight}px`);
  const state = goalState(config, kind, stats);
  const progress = goalProgress(state);
  setText("goal-title", state.title);
  setText("goal-count", `${state.current ?? "–"} / ${state.target}`);
  root.style.setProperty("--progress", String(progress));
  root.dataset["reached"] = String(progress >= 1);
}

function setText(id: string, text: string): void {
  const element = document.getElementById(id);
  if (element !== null) {
    element.textContent = text;
  }
}

function demoStats(config: GoalConfig): StreamStats {
  return {
    followers: Math.round(config.followersTarget * 0.62),
    subscribers: Math.round(config.subsTarget * 0.4),
    subPoints: Math.round(config.subsTarget * 0.5),
    recent: new Map(),
  };
}

// Startup
async function start(): Promise<void> {
  const root = document.documentElement;
  const urlValues = Object.fromEntries(new URLSearchParams(location.search));
  const kind = readGoalKind(urlValues["goal"]);

  if (urlValues["preview"] !== undefined) {
    let config = readGoalConfig({});
    render(root, config, kind, demoStats(config));
    onPreviewMessage(previewSettingsMessage, (data) => {
      if (isRecord(data["settings"])) {
        config = readGoalConfig(data["settings"]);
        render(root, config, kind, demoStats(config));
        reportPreviewOverflow();
      }
    });
    return;
  }

  let config = readGoalConfig({ ...(await fetchOverlaySettings(goalOverlayId)), ...urlValues });
  let stats = parseStats(null);
  render(root, config, kind, stats);
  subscribeToSettings(goalOverlayId, (stored) => {
    config = readGoalConfig({ ...stored, ...urlValues });
    render(root, config, kind, stats);
  });
  subscribeToStats((next) => {
    stats = next;
    render(root, config, kind, stats);
  });
  stats = await fetchStats();
  render(root, config, kind, stats);
}

void start();
