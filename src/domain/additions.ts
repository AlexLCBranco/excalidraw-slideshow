import type { Box } from "./selection";
import type { Page } from "./types";

/**
 * Text and pictures the owner adds on top of a board while presenting. They
 * are never written to the board file: they live in `Slideshow` state and,
 * once the owner presses Save, in this browser. The board's own elements
 * can't be removed, only these.
 */
export type Addition =
  | { kind: "text"; id: string; x: number; y: number; text: string; fontSize: number }
  | {
      kind: "image";
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      /** The picture itself, as a data: URL, so it can be saved and shown offline. */
      dataURL: string;
      mimeType: string;
    };

/** Every added element's id starts with this, so it's never mistaken for one of the board's. */
export const ADDED_PREFIX = "added:";
export const isAdded = (id: string) => id.startsWith(ADDED_PREFIX);

/** Added text is this tall relative to the page it's on, so it reads the same on any board. */
const TEXT_SIZE = 0.035;
/** A new picture fills at most this much of the page's width and height. */
const IMAGE_FIT = 0.6;

export const newId = (now = Date.now(), rand = Math.random()) => `${ADDED_PREFIX}${now.toString(36)}${rand.toString(36).slice(2, 8)}`;

export const textSizeFor = (page: Page) => Math.max(1, Math.round((page.y1 - page.y0) * TEXT_SIZE));

/** Where a new picture goes: centred on the page, shrunk (never enlarged) to fit. */
export function placeImage(page: Page, width: number, height: number): Box {
  const scale = Math.min(1, ((page.x1 - page.x0) * IMAGE_FIT) / width, ((page.y1 - page.y0) * IMAGE_FIT) / height);
  const w = width * scale;
  const h = height * scale;
  const x0 = (page.x0 + page.x1 - w) / 2;
  const y0 = (page.y0 + page.y1 - h) / 2;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

/** Added text is never smaller than this, nor a picture's shorter side, in scene units. */
const MIN_SIZE = 4;

export const moved = (a: Addition, dx: number, dy: number): Addition => ({ ...a, x: a.x + dx, y: a.y + dy });

/** Grows or shrinks an addition from its top-left corner: text by its size, a picture keeping its shape. */
export function scaled(a: Addition, scale: number): Addition {
  if (a.kind === "text") return { ...a, fontSize: Math.max(MIN_SIZE, a.fontSize * scale) };
  const s = Math.max(scale, MIN_SIZE / Math.min(a.width, a.height));
  return { ...a, width: a.width * s, height: a.height * s };
}

/** How much a corner dragged to (x, y) scales a box whose top-left stays put: the larger of the two directions. */
export const cornerScale = (box: Box, x: number, y: number) =>
  Math.max((x - box.x0) / (box.x1 - box.x0), (y - box.y0) / (box.y1 - box.y0), 0);

export const replaceAddition = (list: readonly Addition[], next: Addition): Addition[] =>
  list.map((a) => (a.id === next.id ? next : a));

export const removeAddition = (list: readonly Addition[], id: string): Addition[] => list.filter((a) => a.id !== id);

/** Keeps only well-formed additions, for whatever comes back from storage. */
export function validAdditions(data: unknown): Addition[] {
  if (!Array.isArray(data)) return [];
  return data.filter((a): a is Addition => {
    if (!a || typeof a !== "object") return false;
    const { kind, id, x, y } = a as Record<string, unknown>;
    if (typeof id !== "string" || !isAdded(id) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (kind === "text") return typeof a.text === "string" && Number.isFinite(a.fontSize);
    return kind === "image" && typeof a.dataURL === "string" && Number.isFinite(a.width) && Number.isFinite(a.height);
  });
}
