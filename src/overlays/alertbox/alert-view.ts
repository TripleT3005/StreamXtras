import { mediaUrl } from "../../shared/config.ts";
import { toFontFamily } from "../../shared/fonts.ts";
import { formatAlertText, type OverlayAlert } from "./alert.ts";
import { alertStyle, type AlertboxConfig } from "./alertbox-config.ts";

// Constants
const leaveDurationMs = 500;

// Style
export function applyAlertboxStyle(root: HTMLElement, config: AlertboxConfig): void {
  const { style } = root;
  style.setProperty("--font-family", toFontFamily(config.fontFamily));
  style.setProperty("--font-size", `${config.fontSize}px`);
  style.setProperty("--font-weight", config.fontWeight);
  style.setProperty("--color-text", config.textColor);
  style.setProperty("--color-highlight", config.highlightColor);
  style.setProperty("--text-shadow", config.textShadow ? "0 2px 4px rgb(0 0 0 / 85%)" : "none");
  style.setProperty("--image-size", `${config.imageSize}px`);
  root.dataset["layout"] = config.layout;
  root.dataset["animation"] = config.animation;
}

// Rendering
export function showAlert(container: HTMLElement, alert: OverlayAlert, config: AlertboxConfig): Promise<void> {
  const style = alertStyle(config, alert.type);
  if (!style.enabled) {
    return Promise.resolve();
  }

  const element = document.createElement("div");
  element.className = "alert";

  const imageUrl = mediaUrl(style.image);
  if (imageUrl !== null) {
    const image = document.createElement("img");
    image.className = "alert-image";
    image.src = imageUrl;
    image.alt = "";
    element.append(image);
  }

  const text = document.createElement("p");
  text.className = "alert-text";
  for (const part of formatAlertText(style.text, alert.userName)) {
    if (part.kind === "name") {
      const name = document.createElement("span");
      name.className = "alert-name";
      name.textContent = part.text;
      text.append(name);
    } else {
      text.append(part.text);
    }
  }
  element.append(text);
  container.replaceChildren(element);

  playSound(style.sound, config.volume);

  return new Promise((resolve) => {
    setTimeout(() => {
      element.classList.add("leaving");
      setTimeout(() => {
        element.remove();
        resolve();
      }, leaveDurationMs);
    }, style.durationMs);
  });
}

function playSound(reference: string, volume: number): void {
  const url = mediaUrl(reference);
  if (url === null || volume === 0) {
    return;
  }
  const audio = new Audio(url);
  audio.volume = volume / 100;
  void audio.play().catch((error: unknown) => console.warn("Playing the alert sound failed", error));
}
