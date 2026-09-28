import { describe, expect, it } from "vitest";

import { findPages, fitAll, fitPage, pageAt, zoomAt } from "./pages";
import type { SceneElement } from "./types";

let n = 0;
const rect = (x: number, y: number, width: number, height: number, extra: Partial<SceneElement> = {}): SceneElement => ({
  id: `e${n++}`, type: "rectangle", x, y, width, height, ...extra,
});

describe("findPages without frames", () => {
  it("cuts in the empty gaps near every page height", () => {
    // Three blocks of content with gaps centred on 1000 and 2000.
    const els = [rect(0, 0, 500, 950), rect(0, 1050, 500, 900), rect(0, 2050, 500, 900)];
    const pages = findPages(els, 1000);
    expect(pages.map((p) => p.y1)).toEqual([1000, 2000, 2970]);
    expect(pages[0].y0).toBe(-20);
  });

  it("never cuts through a drawing when a gap is close enough", () => {
    const els = [rect(0, 0, 500, 1200), rect(0, 1300, 500, 600)];
    expect(findPages(els, 1000)[0].y1).toBe(1250);
  });

  it("measures lines by their points, not their width and height", () => {
    const line: SceneElement = { id: "l", type: "line", x: 0, y: 0, width: 0, height: 0, points: [[0, 0], [10, 1900]] };
    expect(findPages([line], 1000)).toHaveLength(2);
  });

  it("gives a small board one page", () => {
    const pages = findPages([rect(0, 0, 100, 100)], 1000);
    expect(pages).toHaveLength(1);
    expect(pages[0].y1).toBe(120);
  });

  it("ignores deleted elements", () => {
    const els = [rect(0, 0, 100, 100), rect(0, 5000, 100, 100, { isDeleted: true })];
    expect(findPages(els, 1000)).toHaveLength(1);
  });
});

describe("findPages with frames", () => {
  const frame = (id: string, x: number, y: number, name: string): SceneElement => ({
    id, type: "frame", x, y, width: 1000, height: 600, name,
  });

  it("uses frames as pages in reading order", () => {
    const els = [
      frame("b", 1100, 0, "Two"), frame("a", 0, 0, "One"), frame("c", 0, 700, "Three"),
      rect(10, 10, 50, 50, { frameId: "a" }), rect(1110, 10, 50, 50), rect(10, 710, 50, 50),
    ];
    expect(findPages(els, 1000).map((p) => p.name)).toEqual(["One", "Two", "Three"]);
  });

  it("ignores a few stray frames that hold little of the drawing", () => {
    const els = [frame("a", 0, 0, "Stray"), rect(10, 10, 50, 50), ...[1, 2, 3, 4, 5].map((i) => rect(0, i * 1000, 50, 50))];
    expect(findPages(els, 1000).every((p) => p.name === "")).toBe(true);
  });
});

describe("fitPage", () => {
  it("centres the page and reports the margin around it", () => {
    const view = fitPage({ x0: 0, y0: 0, x1: 2000, y1: 1000, name: "" }, 1000, 1000);
    expect(view.zoom).toBe(0.5);
    expect(view.scrollX).toBe(0);
    expect(view.scrollY).toBe(500);
    expect(view.marginY).toBe(250);
  });
});

describe("fitAll", () => {
  it("fits every page at once, inside the margin", () => {
    const pages = [0, 1, 2, 3].map((i) => ({ x0: 0, x1: 500, y0: i * 1000, y1: (i + 1) * 1000, name: "" }));
    const camera = fitAll(pages, 1000, 1000, 100);
    expect(camera.zoom).toBe(0.2);
    // The top of the first page sits at the margin, the bottom of the last at the other margin.
    expect((0 + camera.scrollY) * camera.zoom).toBe(100);
    expect((4000 + camera.scrollY) * camera.zoom).toBe(900);
  });
});

describe("zoomAt", () => {
  it("keeps the scene point under the cursor in place", () => {
    const before = { zoom: 0.5, scrollX: 100, scrollY: 40 };
    const after = zoomAt(before, 300, 200, 2);
    const scene = (c: typeof before) => [300 / c.zoom - c.scrollX, 200 / c.zoom - c.scrollY];
    expect(after.zoom).toBe(2);
    expect(scene(after)).toEqual(scene(before));
  });
});

describe("pageAt", () => {
  it("finds the page holding a height, clamped to the last page", () => {
    const pages = [0, 1, 2].map((i) => ({ x0: 0, x1: 1, y0: i * 100, y1: (i + 1) * 100, name: "" }));
    expect(pageAt(pages, 150)).toBe(1);
    expect(pageAt(pages, 9999)).toBe(2);
  });
});
