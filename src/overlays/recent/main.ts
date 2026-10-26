import { formatAlertText, isAlertType, type AlertType } from "../../shared/alerts.ts";
import { applyAppearance } from "../../shared/appearance.ts";
import { fetchOverlaySettings, subscribeToSettings } from "../../shared/config.ts";
import { isRecord } from "../../shared/json.ts";
import { onPreviewMessage, previewSettingsMessage, reportPreviewOverflow } from "../../shared/preview-messages.ts";
import { fetchStats, parseStats, subscribeToStats, type RecentEntry, type StreamStats } from "../../shared/stats.ts";
import { readRecentConfig, recentOverlayId, type RecentConfig } from "./recent-config.ts";

// Constants
const demoNames = ["NightOwl", "PixelPanda", "LunaLoops", "CaptainCozy", "ByteBard", "MossyMoss", "StarSprout", "TeaTimeTom", "QuietQuasar", "ZigZagZoe"];

// Rendering
function render(root: HTMLElement, config: RecentConfig, type: AlertType, stats: StreamStats): void {
  applyAppearance(root, config);
  root.dataset["layout"] = config.layout;
  const title = document.getElementById("recent-title");
  const list = document.getElementById("recent-list");
  if (title === null || list === null) {
    return;
  }
  const titleText = config[`${type}Title`];
  title.textContent = titleText;
  title.hidden = titleText === "";
  const entries = (stats.recent.get(type) ?? []).slice(0, config[`${type}Count`]);
  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = config.emptyText;
    list.replaceChildren(...(config.emptyText === "" ? [] : [empty]));
    return;
  }
  list.replaceChildren(...entries.map((entry) => renderEntry(config[`${type}Item`], entry)));
}

function renderEntry(template: string, entry: RecentEntry): HTMLLIElement {
  const item = document.createElement("li");
  for (const part of formatAlertText(template, entry)) {
    if (part.kind === "highlight") {
      const highlight = document.createElement("span");
      highlight.className = "highlight";
      highlight.textContent = part.text;
      item.append(highlight);
    } else {
      item.append(part.text);
    }
  }
  return item;
}

function demoStats(type: AlertType): StreamStats {
  const entries: RecentEntry[] = demoNames.map((userName, index) => ({
    type,
    userName,
    amount: type === "cheer" ? 100 * (index + 1) : index + 3,
    tier: index % 3 === 0 ? "prime" : "1",
    message: "",
  }));
  return { followers: null, subscribers: null, subPoints: null, recent: new Map([[type, entries]]) };
}

// Startup
async function start(): Promise<void> {
  const root = document.documentElement;
  const urlValues = Object.fromEntries(new URLSearchParams(location.search));
  const requested = urlValues["type"];
  const type: AlertType = isAlertType(requested) ? requested : "follow";

  if (urlValues["preview"] !== undefined) {
    const stats = demoStats(type);
    render(root, readRecentConfig({}), type, stats);
    onPreviewMessage(previewSettingsMessage, (data) => {
      if (isRecord(data["settings"])) {
        render(root, readRecentConfig(data["settings"]), type, stats);
        reportPreviewOverflow();
      }
    });
    return;
  }

  let config = readRecentConfig({ ...(await fetchOverlaySettings(recentOverlayId)), ...urlValues });
  let stats = parseStats(null);
  subscribeToSettings(recentOverlayId, (stored) => {
    config = readRecentConfig({ ...stored, ...urlValues });
    render(root, config, type, stats);
  });
  subscribeToStats((next) => {
    stats = next;
    render(root, config, type, stats);
  });
  stats = await fetchStats();
  render(root, config, type, stats);
}

void start();
