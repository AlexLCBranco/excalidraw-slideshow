import { elementBounds } from "./pages";
import type { Board } from "./scene";
import type { SceneElement } from "./types";

/** Empty canvas left between two boards of a group, in scene units. */
const GAP = 1000;

/**
 * Presents several boards as one: each board's drawing is moved to sit below
 * the previous one, so paging through the result walks through every board in
 * order. Everything happens on copies in memory; the boards are never changed.
 *
 * Element ids are prefixed per board, because boards copied from one another
 * share ids, and Excalidraw needs them unique. Every link between elements
 * (frames, groups, text in shapes, arrow bindings) is renamed to match.
 */
export function stackBoards(name: string, boards: readonly Board[]): Board {
  const elements: SceneElement[] = [];
  const parts: { name: string; elements: SceneElement[] }[] = [];
  let top = 0;

  boards.forEach((board, i) => {
    const live = board.elements.filter((e) => !e.isDeleted);
    let y0 = Infinity, y1 = -Infinity;
    for (const b of live.map(elementBounds)) {
      if (!b) continue;
      y0 = Math.min(y0, b.y0);
      y1 = Math.max(y1, b.y1);
    }
    if (!Number.isFinite(y0 + y1)) return;

    const moved = live.map((e) => moveElement(e, `${i}:`, top - y0));
    elements.push(...moved);
    parts.push({ name: board.name.replace(/\.excalidraw$/i, ""), elements: moved });
    top += y1 - y0 + GAP;
  });

  return {
    name,
    elements,
    // Image ids are content hashes, so two boards sharing one mean the same image.
    files: Object.assign({}, ...boards.map((b) => b.files)),
    background: boards[0]?.background ?? "#ffffff",
    parts,
  };
}

function moveElement(e: SceneElement, prefix: string, dy: number): SceneElement {
  const rename = <T extends string | null | undefined>(id: T) => (id ? prefix + id : id);
  const renameBinding = (b: SceneElement["startBinding"]) => (b ? { ...b, elementId: prefix + b.elementId } : b);
  return {
    ...e,
    id: prefix + e.id,
    y: e.y + dy,
    frameId: rename(e.frameId),
    containerId: rename(e.containerId),
    groupIds: e.groupIds?.map((g) => prefix + g),
    boundElements: e.boundElements ? e.boundElements.map((b) => ({ ...b, id: prefix + b.id })) : e.boundElements,
    startBinding: renameBinding(e.startBinding),
    endBinding: renameBinding(e.endBinding),
    // Each board's keys only order its own elements; Excalidraw makes fresh ones from array order.
    index: null,
  };
}
