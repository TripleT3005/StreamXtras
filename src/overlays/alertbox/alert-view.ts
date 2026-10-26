import { isVideoReference, mediaUrl } from "../../shared/config.ts";
import { applyAppearance } from "../../shared/appearance.ts";
import { formatAlertText, type OverlayAlert } from "../../shared/alerts.ts";
import { alertSpeech, alertStyle, type AlertboxConfig, type AlertStyle } from "./alertbox-config.ts";

// Constants
const leaveDurationMs = 500;
const metadataTimeoutMs = 3000;
const maxVideoDurationMs = 5 * 60 * 1000;
const maxSoundWaitMs = 10_000;
const maxSpeechMs = 60_000;

// Style
export function applyAlertboxStyle(root: HTMLElement, config: AlertboxConfig): void {
  applyAppearance(root, config);
  const { style } = root;
  style.setProperty("--image-size", `${config.imageSize}px`);
  style.setProperty("--video-width", `${config.videoWidth}px`);
  root.dataset["layout"] = config.layout;
  root.dataset["animation"] = config.animation;
}

// Rendering
export async function showAlert(container: HTMLElement, alert: OverlayAlert, config: AlertboxConfig): Promise<void> {
  const style = alertStyle(config, alert);
  if (!style.enabled) {
    return;
  }

  const element = document.createElement("div");
  element.className = "alert";
  const visual = createVisual(style, alert, config.volume);
  if (visual !== null) {
    element.append(visual);
  }

  const text = document.createElement("p");
  text.className = "alert-text";
  for (const part of formatAlertText(style.text, alert)) {
    if (part.kind === "highlight") {
      const highlight = document.createElement("span");
      highlight.className = "alert-highlight";
      highlight.textContent = part.text;
      text.append(highlight);
    } else {
      text.append(part.text);
    }
  }
  element.append(text);
  container.replaceChildren(element);

  const startedAt = performance.now();
  const sound = playSound(style.sound, config.volume);
  const speech = alertSpeech(config, alert, style.text);
  const spoken = speech === "" ? Promise.resolve() : speak(speech, config, sound);
  const visibleMs = await visibleDuration(style.durationMs, visual instanceof HTMLVideoElement ? visual : null);
  await Promise.all([wait(visibleMs - (performance.now() - startedAt)), spoken]);
  element.classList.add("leaving");
  await wait(leaveDurationMs);
  element.remove();
}

function createVisual(style: AlertStyle, alert: OverlayAlert, volume: number): HTMLElement | null {
  if (style.avatar && alert.avatarUrl !== null) {
    return image(alert.avatarUrl, "alert-image avatar");
  }
  const url = mediaUrl(style.image);
  if (url === null) {
    return null;
  }
  if (!isVideoReference(style.image)) {
    return image(url, "alert-image");
  }
  const video = document.createElement("video");
  video.className = "alert-video";
  video.src = url;
  video.playsInline = true;
  video.volume = volume / 100;
  video.play().catch(() => {
    video.muted = true;
    void video.play().catch((error: unknown) => console.warn("Playing the alert video failed", error));
  });
  return video;
}

function image(url: string, className: string): HTMLImageElement {
  const element = document.createElement("img");
  element.className = className;
  element.src = url;
  element.alt = "";
  return element;
}

function visibleDuration(durationMs: number, video: HTMLVideoElement | null): Promise<number> {
  if (video === null) {
    return Promise.resolve(durationMs);
  }
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timeout);
      const videoMs = Number.isFinite(video.duration) ? video.duration * 1000 : 0;
      resolve(Math.min(maxVideoDurationMs, Math.max(durationMs, videoMs)));
    };
    const timeout = setTimeout(finish, metadataTimeoutMs);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      finish();
    } else {
      video.addEventListener("loadedmetadata", finish, { once: true });
      video.addEventListener("error", finish, { once: true });
    }
  });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
}

function playSound(reference: string, volume: number): HTMLAudioElement | null {
  const url = mediaUrl(reference);
  if (url === null || volume === 0) {
    return null;
  }
  const audio = new Audio(url);
  audio.volume = volume / 100;
  void audio.play().catch((error: unknown) => console.warn("Playing the alert sound failed", error));
  return audio;
}

// Speech
async function speak(text: string, config: AlertboxConfig, sound: HTMLAudioElement | null): Promise<void> {
  if (config.ttsVolume === 0) {
    return;
  }
  try {
    const response = await fetch("/api/tts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: config.ttsVoice }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const url = URL.createObjectURL(await response.blob());
    await finished(sound, maxSoundWaitMs);
    const audio = new Audio(url);
    audio.volume = config.ttsVolume / 100;
    const ended = finished(audio, maxSpeechMs);
    await audio.play();
    await ended;
    URL.revokeObjectURL(url);
  } catch (error: unknown) {
    console.warn("Reading the alert aloud failed", error);
  }
}

function finished(audio: HTMLAudioElement | null, timeoutMs: number): Promise<void> {
  if (audio === null || audio.ended) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(done, timeoutMs);
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("error", done, { once: true });
  });
}
