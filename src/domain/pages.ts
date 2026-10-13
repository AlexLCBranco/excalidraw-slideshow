import type { Board } from "./scene";
import type { Page, SceneElement } from "./types";

export const DEFAULT_PAGE_HEIGHT = 1000;

/** Space left around automatically found pages, in scene units. */
const PAD = 20;
/** Frames count as the pages once they hold this share of the drawing. */
const FRAME_COVERAGE = 0.8;

const isFrame = (e: SceneElement) => e.type === "frame" || e.type === "magicframe";

/**
 * Splits a board into pages, in reading order.
 *
 * 1. If the board has frames holding most of the drawing, each frame is a page
 *    (top-to-bottom, then left-to-right). A couple of stray frames don't count.
 * 2. Otherwise the canvas is cut into horizontal bands about `pageHeight` tall,
 *    each cut placed in the nearest empty gap between content, so no drawing is
 *    sliced in half.
 */
export function findPages(elements: readonly SceneElement[], pageHeight: number): Page[] {
  const live = elements.filter((e) => !e.isDeleted);
  const frames = live.filter(isFrame);
  const content = live.filter((e) => !isFrame(e));

  if (frames.length) {
    const inside = (e: SceneElement) =>
      frames.some(
        (f) =>
          e.frameId === f.id ||
          (e.x >= f.x &&
            e.y >= f.y &&
            e.x + (e.width ?? 0) <= f.x + (f.width ?? 0) &&
            e.y + (e.height ?? 0) <= f.y + (f.height ?? 0)),
      );
    if (content.filter(inside).length >= content.length * FRAME_COVERAGE) {
      return frames
        .map((f) => ({ x0: f.x, y0: f.y, x1: f.x + (f.width ?? 0), y1: f.y + (f.height ?? 0), name: f.name ?? "", frameId: f.id }))
        .sort((a, b) => (Math.abs(a.y0 - b.y0) > 50 ? a.y0 - b.y0 : a.x0 - b.x0));
    }
  }

  return bandPages(content, pageHeight);
}

/**
 * The pages of a board. A group of boards (see `stackBoards`) is split board
 * by board, so each keeps its own frames-or-bands choice, and its
 * automatically found pages are named after the board they come from.
 * A spreadsheet's pages were fixed when it was read.
 */
export function boardPages(board: Pick<Board, "elements" | "parts" | "pages">, pageHeight: number): Page[] {
  if (board.pages) return [...board.pages];
  if (!board.parts) return findPages(board.elements, pageHeight);
  return board.parts.flatMap((part) =>
    findPages(part.elements, pageHeight).map((p) => (p.frameId ? p : { ...p, name: part.name })),
  );
}

function bandPages(content: readonly SceneElement[], pageHeight: number): Page[] {
  const boxes = content.map(elementBounds).filter((b) => b !== null);
  if (!boxes.length) return [];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x0);
    maxX = Math.max(maxX, b.x1);
    minY = Math.min(minY, b.y0);
    maxY = Math.max(maxY, b.y1);
  }

  // Empty horizontal bands between content: sweep the boxes top to bottom.
  const spans = boxes.map((b) => [b.y0, b.y1] as const).sort((a, b) => a[0] - b[0]);
  const gaps: { mid: number; size: number }[] = [];
  let end = spans[0][1];
  for (const [start, stop] of spans) {
    if (start > end) gaps.push({ mid: (start + end) / 2, size: start - end });
    end = Math.max(end, stop);
  }

  const pages: Page[] = [];
  let top = minY - PAD;
  // Always at least one page; after that, stop once the leftover strip is short.
  while (pages.length === 0 || maxY + PAD - top > pageHeight * 0.35) {
    const ideal = top + pageHeight;
    let cut = ideal;
    if (ideal < maxY) {
      // Pick the gap nearest the ideal cut, favouring wider gaps a little.
      let best = Infinity;
      for (const g of gaps) {
        if (g.mid < top + pageHeight * 0.6 || g.mid > top + pageHeight * 1.4) continue;
        const cost = Math.abs(g.mid - ideal) - Math.min(g.size, 200);
        if (cost < best) {
          best = cost;
          cut = g.mid;
        }
      }
    } else {
      cut = maxY + PAD;
    }
    pages.push({ x0: minX - PAD, y0: top, x1: maxX + PAD, y1: cut, name: "" });
    top = cut;
  }
  // A short leftover strip joins the last page instead of being its own page.
  if (pages.length && maxY + PAD > top) pages[pages.length - 1].y1 = maxY + PAD;
  return pages;
}

/** Axis-aligned bounds of an element; rotated shapes get a box that contains them. */
export function elementBounds(e: SceneElement) {
  let xs: number[], ys: number[];
  if (e.points?.length) {
    xs = e.points.map((p) => e.x + p[0]);
    ys = e.points.map((p) => e.y + p[1]);
  } else {
    xs = [e.x, e.x + (e.width ?? 0)];
    ys = [e.y, e.y + (e.height ?? 0)];
  }
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (e.angle) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.hypot(x1 - x0, y1 - y0) / 2;
    x0 = cx - r; x1 = cx + r; y0 = cy - r; y1 = cy + r;
  }
  return Number.isFinite(x0 + x1 + y0 + y1) ? { x0, x1, y0, y1 } : null;
}

/**
 * The camera that fits `page` into a `width` x `height` viewport, centred.
 * Excalidraw draws scene point p at screen (p + scroll) * zoom.
 */
export function fitPage(page: Page, width: number, height: number) {
  const zoom = Math.min(width / (page.x1 - page.x0), height / (page.y1 - page.y0));
  return {
    zoom,
    scrollX: width / (2 * zoom) - (page.x0 + page.x1) / 2,
    scrollY: height / (2 * zoom) - (page.y0 + page.y1) / 2,
    /** Empty screen space above and below the page, covered to hide neighbours. */
    marginY: Math.max(0, (height - (page.y1 - page.y0) * zoom) / 2),
  };
}

/** The camera that fits all of `pages` into the viewport, with at least `margin` px around them. */
export function fitAll(pages: readonly Page[], width: number, height: number, margin: number): Camera {
  const all = {
    x0: Math.min(...pages.map((p) => p.x0)),
    y0: Math.min(...pages.map((p) => p.y0)),
    x1: Math.max(...pages.map((p) => p.x1)),
    y1: Math.max(...pages.map((p) => p.y1)),
    name: "",
  };
  // A window too small for the margin just loses it.
  const m = Math.max(0, Math.min(margin, (width - 1) / 2, (height - 1) / 2));
  const { zoom, scrollX, scrollY } = fitPage(all, width - 2 * m, height - 2 * m);
  return { zoom, scrollX: scrollX + m / zoom, scrollY: scrollY + m / zoom };
}

export interface Camera {
  zoom: number;
  scrollX: number;
  scrollY: number;
}

/**
 * The camera zoomed to `zoom`, keeping the scene point under screen point
 * (`x`, `y`) where it is, so the drawing grows around the cursor.
 */
export function zoomAt(camera: Camera, x: number, y: number, zoom: number): Camera {
  return {
    zoom,
    scrollX: camera.scrollX + x / zoom - x / camera.zoom,
    scrollY: camera.scrollY + y / zoom - y / camera.zoom,
  };
}

/** The page containing scene height `y`, used to stay in place when pages change. */
export function pageAt(pages: readonly Page[], y: number) {
  const i = pages.findIndex((p) => p.y1 > y);
  return i === -1 ? pages.length - 1 : i;
}
