import type { EmotePlacement } from "../events.ts";
import { createTwitchEmote, type Emote, type EmoteLookup } from "./emote.ts";

// Types
export interface TextFragment {
  readonly kind: "text";
  readonly text: string;
}

export interface EmoteFragment {
  readonly kind: "emote";
  readonly emote: Emote;
  readonly overlays: readonly Emote[];
}

export type MessageFragment = TextFragment | EmoteFragment;

type MutableFragment = { kind: "text"; text: string } | { kind: "emote"; emote: Emote; overlays: Emote[] };

// Building
export function buildFragments(text: string, placements: readonly EmotePlacement[], lookup: EmoteLookup): MessageFragment[] {
  const codePoints = Array.from(text);
  const fragments: MutableFragment[] = [];
  let position = 0;

  for (const placement of placements) {
    if (placement.start < position || placement.end >= codePoints.length) {
      continue;
    }
    appendWords(fragments, codePoints.slice(position, placement.start).join(""), lookup);
    const name = codePoints.slice(placement.start, placement.end + 1).join("");
    fragments.push({ kind: "emote", emote: createTwitchEmote(placement.id, name), overlays: [] });
    position = placement.end + 1;
  }

  appendWords(fragments, codePoints.slice(position).join(""), lookup);
  return fragments;
}

function appendWords(fragments: MutableFragment[], text: string, lookup: EmoteLookup): void {
  for (const part of text.split(/(\s+)/)) {
    if (part === "") {
      continue;
    }
    const emote = /^\s/.test(part) ? undefined : lookup.get(part);
    if (emote === undefined) {
      appendText(fragments, part);
    } else if (!emote.zeroWidth || !attachOverlay(fragments, emote)) {
      fragments.push({ kind: "emote", emote, overlays: [] });
    }
  }
}

function appendText(fragments: MutableFragment[], text: string): void {
  const last = fragments.at(-1);
  if (last?.kind === "text") {
    last.text += text;
  } else {
    fragments.push({ kind: "text", text });
  }
}

function attachOverlay(fragments: MutableFragment[], overlay: Emote): boolean {
  const last = fragments.at(-1);
  const hasSeparator = last?.kind === "text" && last.text.trim() === "";
  const target = hasSeparator ? fragments.at(-2) : last;
  if (target?.kind !== "emote") {
    return false;
  }
  if (hasSeparator) {
    fragments.pop();
  }
  target.overlays.push(overlay);
  return true;
}
