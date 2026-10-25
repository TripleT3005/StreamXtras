import { subscribeToCompanionEvent } from "../../shared/companion-events.ts";
import { fetchOverlaySettings, readStringList, subscribeToSettings } from "../../shared/config.ts";
import { isRecord } from "../../shared/json.ts";
import { onPreviewMessage, previewAlertMessage, previewSettingsMessage } from "../../shared/preview-messages.ts";
import { parseAlert, type OverlayAlert } from "./alert.ts";
import { AlertQueue } from "./alert-queue.ts";
import { applyAlertboxStyle, showAlert } from "./alert-view.ts";
import { alertboxOverlayId, readAlertboxConfig, type AlertboxConfig } from "./alertbox-config.ts";

// Constants
const previewAlertDefaults = { type: "follow", userName: "StreamXtras", userLogin: "streamxtras", test: true };

// Startup
async function start(): Promise<void> {
  const container = document.getElementById("alerts");
  if (container === null) {
    return;
  }

  const root = document.documentElement;
  const urlValues = Object.fromEntries(new URLSearchParams(location.search));
  const isPreview = urlValues["preview"] !== undefined;
  const shownTypes = new Set(readStringList(urlValues, "types", []).map((type) => type.toLowerCase()));

  let config: AlertboxConfig = readAlertboxConfig(isPreview ? {} : { ...(await fetchOverlaySettings(alertboxOverlayId)), ...urlValues });
  applyAlertboxStyle(root, config);
  const queue = new AlertQueue<OverlayAlert>((alert) => showAlert(container, alert, config));

  const apply = (next: AlertboxConfig): void => {
    config = next;
    applyAlertboxStyle(root, config);
  };

  if (isPreview) {
    onPreviewMessage(previewSettingsMessage, (data) => {
      if (isRecord(data["settings"])) {
        apply(readAlertboxConfig(data["settings"]));
      }
    });
    onPreviewMessage(previewAlertMessage, (data) => {
      const alert = parseAlert({ ...previewAlertDefaults, ...(isRecord(data["alert"]) ? data["alert"] : {}) });
      if (alert !== null) {
        queue.enqueue(alert);
      }
    });
    return;
  }

  subscribeToSettings(alertboxOverlayId, (stored) => apply(readAlertboxConfig({ ...stored, ...urlValues })));
  subscribeToCompanionEvent("alert", (data) => {
    const alert = parseAlert(data);
    if (alert !== null && (shownTypes.size === 0 || shownTypes.has(alert.type))) {
      queue.enqueue(alert);
    }
  });
}

void start();
