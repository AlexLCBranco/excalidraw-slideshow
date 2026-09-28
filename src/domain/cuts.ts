import type { Page } from "./types";

/** No page can be made shorter than this, in scene units. */
export const MIN_PAGE = 50;

/**
 * Pages cut by hand. A board without frames is a column of pages, so its
 * pages are fully described by where one ends and the next begins: `cuts`,
 * sorted scene heights. The automatically found pages give the rest: how far
 * the drawing reaches up, down and sideways, and the names.
 */
export const canCut = (pages: readonly Page[]) => pages.length > 0 && !pages.some((p) => p.frameId);

/** Where the automatic pages are cut, as a starting point for cutting by hand. */
export const cutsOf = (pages: readonly Page[]) => pages.slice(0, -1).map((p) => p.y1);

/**
 * The pages between `cuts`. Each one is trimmed to the automatic pages it
 * overlaps, so the empty space between the boards of a group stays out, and
 * it's named after the automatic page it overlaps most.
 */
export function pagesFromCuts(auto: readonly Page[], cuts: readonly number[]): Page[] {
  const top = auto[0].y0;
  const bottom = auto[auto.length - 1].y1;
  const edges = [top, ...cuts.filter((c) => c > top && c < bottom).sort((a, b) => a - b), bottom];
  const pages: Page[] = [];
  for (let i = 1; i < edges.length; i++) {
    const [y0, y1] = [edges[i - 1], edges[i]];
    const under = auto.filter((p) => p.y1 > y0 && p.y0 < y1);
    if (!under.length) continue;
    const overlap = (p: Page) => Math.min(p.y1, y1) - Math.max(p.y0, y0);
    pages.push({
      x0: Math.min(...under.map((p) => p.x0)),
      x1: Math.max(...under.map((p) => p.x1)),
      y0: Math.max(y0, under[0].y0),
      y1: Math.min(y1, under[under.length - 1].y1),
      name: under.reduce((a, b) => (overlap(b) > overlap(a) ? b : a)).name,
    });
  }
  return pages;
}

/** The cuts with cut `i` moved to `y`, kept at least MIN_PAGE from its neighbours and the board's edges. */
export function moveCut(cuts: readonly number[], i: number, y: number, top: number, bottom: number) {
  const lo = (i > 0 ? cuts[i - 1] : top) + MIN_PAGE;
  const hi = (i < cuts.length - 1 ? cuts[i + 1] : bottom) - MIN_PAGE;
  return cuts.map((c, j) => (j === i ? Math.max(lo, Math.min(hi, y)) : c));
}

/** The cuts with one more at `y`, unless that would leave a page shorter than MIN_PAGE. */
export function addCut(cuts: readonly number[], y: number, top: number, bottom: number) {
  if ([top, ...cuts, bottom].some((c) => Math.abs(c - y) < MIN_PAGE)) return cuts;
  return [...cuts, y].sort((a, b) => a - b);
}
