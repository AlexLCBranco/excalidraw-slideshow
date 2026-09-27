import { type Camera, elementBounds } from "./pages";
import type { SceneElement } from "./types";

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A box between two corners given in any order. */
export const boxBetween = (ax: number, ay: number, bx: number, by: number): Box => ({
  x0: Math.min(ax, bx),
  y0: Math.min(ay, by),
  x1: Math.max(ax, bx),
  y1: Math.max(ay, by),
});

/** A screen box in scene coordinates. Excalidraw draws scene point p at screen (p + scroll) * zoom. */
export const toScene = (c: Camera, b: Box): Box => ({
  x0: b.x0 / c.zoom - c.scrollX,
  y0: b.y0 / c.zoom - c.scrollY,
  x1: b.x1 / c.zoom - c.scrollX,
  y1: b.y1 / c.zoom - c.scrollY,
});

/** A scene box in screen coordinates. */
export const toScreen = (c: Camera, b: Box): Box => ({
  x0: (b.x0 + c.scrollX) * c.zoom,
  y0: (b.y0 + c.scrollY) * c.zoom,
  x1: (b.x1 + c.scrollX) * c.zoom,
  y1: (b.y1 + c.scrollY) * c.zoom,
});

/** Elements lying wholly inside a scene box, as a drag-select on excalidraw.com picks them. */
export function elementsInBox(elements: readonly SceneElement[], box: Box): SceneElement[] {
  const hits = elements.filter((e) => {
    const b = !e.isDeleted && elementBounds(e);
    return b && b.x0 >= box.x0 && b.y0 >= box.y0 && b.x1 <= box.x1 && b.y1 <= box.y1;
  });
  return withRelated(elements, hits);
}

/** The topmost element whose bounds hold a scene point, with what belongs to it. Empty if none. */
export function elementAt(elements: readonly SceneElement[], x: number, y: number): SceneElement[] {
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i];
    const b = !e.isDeleted && elementBounds(e);
    if (b && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return withRelated(elements, [e]);
  }
  return [];
}

/**
 * Widens a selection the way Excalidraw does: a grouped element brings its
 * whole outermost group, and a shape brings the text written inside it.
 */
function withRelated(elements: readonly SceneElement[], picked: readonly SceneElement[]): SceneElement[] {
  const groups = new Set(picked.map((e) => e.groupIds?.at(-1)).filter((g) => g));
  const ids = new Set(picked.map((e) => e.id));
  for (const e of elements) {
    if (e.isDeleted) continue;
    const outer = e.groupIds?.at(-1);
    if (outer && groups.has(outer)) ids.add(e.id);
  }
  for (const e of elements) {
    if (!e.isDeleted && e.containerId && ids.has(e.containerId)) ids.add(e.id);
  }
  return elements.filter((e) => ids.has(e.id));
}

/**
 * The selection in Excalidraw's clipboard format, so it pastes into
 * excalidraw.com (or Obsidian) as real shapes, with the images it uses.
 */
export function clipboardText(selected: readonly SceneElement[], files: Record<string, unknown>) {
  const used = Object.fromEntries(
    selected.flatMap((e) => (e.fileId && files[e.fileId] ? [[e.fileId, files[e.fileId]]] : [])),
  );
  return JSON.stringify({ type: "excalidraw/clipboard", elements: selected, files: used });
}
