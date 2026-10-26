import { isRecord } from "./json.ts";

// Constants
export const previewSettingsMessage = "streamxtras:preview-settings";
export const previewAlertMessage = "streamxtras:preview-alert";
export const previewOverflowMessage = "streamxtras:preview-overflow";

// Constants
const overflowCheckDelayMs = 300;

// Messages
export function onPreviewMessage(type: string, listener: (data: Readonly<Record<string, unknown>>) => void): void {
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.origin === location.origin && isRecord(event.data) && event.data["type"] === type) {
      listener(event.data);
    }
  });
}

export function reportPreviewOverflow(): void {
  setTimeout(() => {
    const { body } = document;
    const overflowing = body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1;
    window.parent.postMessage({ type: previewOverflowMessage, overflowing }, location.origin);
  }, overflowCheckDelayMs);
}

export function postPreviewMessage(frame: HTMLIFrameElement, type: string, data: Readonly<Record<string, unknown>> = {}): void {
  frame.contentWindow?.postMessage({ ...data, type }, location.origin);
}
