import { isRecord } from "./json.ts";

// Constants
export const previewSettingsMessage = "streamxtras:preview-settings";
export const previewAlertMessage = "streamxtras:preview-alert";

// Messages
export function onPreviewMessage(type: string, listener: (data: Readonly<Record<string, unknown>>) => void): void {
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.origin === location.origin && isRecord(event.data) && event.data["type"] === type) {
      listener(event.data);
    }
  });
}

export function postPreviewMessage(frame: HTMLIFrameElement, type: string, data: Readonly<Record<string, unknown>> = {}): void {
  frame.contentWindow?.postMessage({ ...data, type }, location.origin);
}
