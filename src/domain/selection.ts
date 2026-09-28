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

export interface Point {
  x: number;
  y: number;
}

/** The smallest box holding every point. */
export const boxAround = (points: readonly Point[]): Box => ({
  x0: Math.min(...points.map((p) => p.x)),
  y0: Math.min(...points.map((p) => p.y)),
  x1: Math.max(...points.map((p) => p.x)),
  y1: Math.max(...points.map((p) => p.y)),
});

/** A screen point in scene coordinates. */
export const pointToScene = (c: Camera, p: Point): Point => ({ x: p.x / c.zoom - c.scrollX, y: p.y / c.zoom - c.scrollY });

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

/**
 * Elements lying wholly inside a freehand loop (scene coordinates), as the
 * lasso on excalidraw.com picks them. Each element is tested at the corners,
 * edge midpoints and centre of its bounds.
 */
export function elementsInLasso(elements: readonly SceneElement[], loop: readonly Point[]): SceneElement[] {
  if (loop.length < 3) return [];
  const hits = elements.filter((e) => {
    const b = !e.isDeleted && elementBounds(e);
    if (!b) return false;
    const xs = [b.x0, (b.x0 + b.x1) / 2, b.x1];
    const ys = [b.y0, (b.y0 + b.y1) / 2, b.y1];
    return xs.every((x) => ys.every((y) => insideLoop({ x, y }, loop)));
  });
  return withRelated(elements, hits);
}

/** Whether a point lies inside a closed loop (even-odd rule). */
export function insideLoop(p: Point, loop: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i];
    const b = loop[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The selection after a drag or click picked `picked`. Without Shift it
 * replaces the old one. With Shift it adds to it, except a Shift-click on
 * something already selected, which takes that out, as on excalidraw.com.
 */
export function extendSelection(
  elements: readonly SceneElement[],
  selected: readonly SceneElement[],
  picked: readonly SceneElement[],
  { shift, click }: { shift: boolean; click: boolean },
): SceneElement[] {
  if (!shift) return [...picked];
  const had = new Set(selected.map((e) => e.id));
  if (click && picked.length && picked.every((e) => had.has(e.id))) {
    const out = new Set(picked.map((e) => e.id));
    return selected.filter((e) => !out.has(e.id));
  }
  const ids = new Set([...had, ...picked.map((e) => e.id)]);
  return elements.filter((e) => ids.has(e.id));
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
