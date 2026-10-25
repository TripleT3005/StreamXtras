import { subscribeToCompanionEvent } from "../../shared/companion-events.ts";
import { fetchOverlaySettings, subscribeToSettings } from "../../shared/config.ts";
import { isRecord } from "../../shared/json.ts";
import { onPreviewMessage, previewAlertMessage, previewSettingsMessage } from "../../shared/preview-messages.ts";
import { parseAlert, type OverlayAlert } from "./alert.ts";
import { AlertQueue } from "./alert-queue.ts";
import { applyAlertboxStyle, showAlert } from "./alert-view.ts";
import { alertboxOverlayId, readAlertboxConfig, type AlertboxConfig } from "./alertbox-config.ts";

// Constants
const previewAlert: OverlayAlert = { type: "follow", userName: "StreamXtras", test: true };

// Startup
async function start(): Promise<void> {
  const container = document.getElementById("alerts");
  if (container === null) {
    return;
  }

  const root = document.documentElement;
  const urlValues = Object.fromEntries(new URLSearchParams(location.search));
  const isPreview = urlValues["preview"] !== undefined;

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
    onPreviewMessage(previewAlertMessage, () => queue.enqueue(previewAlert));
    return;
  }

  subscribeToSettings(alertboxOverlayId, (stored) => apply(readAlertboxConfig({ ...stored, ...urlValues })));
  subscribeToCompanionEvent("alert", (data) => {
    const alert = parseAlert(data);
    if (alert !== null) {
      queue.enqueue(alert);
    }
  });
}

void start();
