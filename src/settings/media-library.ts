import { isRecord } from "../shared/json.ts";
import type { MediaKind } from "../shared/settings.ts";

// Types
export interface MediaFile {
  readonly file: string;
  readonly value: string;
  readonly kind: MediaKind;
}

// Library
export class MediaLibrary {
  #files: readonly MediaFile[] = [];
  readonly #listeners = new Set<() => void>();

  get files(): readonly MediaFile[] {
    return this.#files;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async refresh(): Promise<void> {
    const response = await fetch("/api/media", { cache: "no-store" });
    const data: unknown = response.ok ? await response.json() : [];
    this.#files = Array.isArray(data) ? data.flatMap(parseMediaFile) : [];
    for (const listener of this.#listeners) {
      listener();
    }
  }

  async upload(file: File): Promise<MediaFile> {
    const response = await fetch(`/api/media?name=${encodeURIComponent(file.name)}`, { method: "PUT", body: file });
    if (!response.ok) {
      throw new Error(response.status === 415 ? await response.text() : `HTTP ${response.status}`);
    }
    const stored = parseMediaFile(await response.json())[0];
    if (stored === undefined) {
      throw new Error("Unexpected answer from the companion app");
    }
    await this.refresh();
    return stored;
  }

  async remove(file: string): Promise<void> {
    const response = await fetch(`/api/media/${encodeURIComponent(file)}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      throw new Error(`HTTP ${response.status}`);
    }
    await this.refresh();
  }
}

function parseMediaFile(data: unknown): MediaFile[] {
  if (!isRecord(data) || typeof data["file"] !== "string" || typeof data["value"] !== "string") {
    return [];
  }
  const kind = data["kind"];
  return kind === "sound" || kind === "image" || kind === "video" ? [{ file: data["file"], value: data["value"], kind }] : [];
}
