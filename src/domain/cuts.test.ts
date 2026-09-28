import { describe, expect, it } from "vitest";

import { addCut, canCut, cutsOf, moveCut, pagesFromCuts } from "./cuts";
import type { Page } from "./types";

const band = (y0: number, y1: number, name = "", x0 = 0, x1 = 500): Page => ({ x0, y0, x1, y1, name });

describe("pagesFromCuts", () => {
  const auto = [band(0, 1000), band(1000, 2000), band(2000, 2600)];

  it("gives back the automatic pages for their own cuts", () => {
    expect(pagesFromCuts(auto, cutsOf(auto))).toEqual(auto);
  });

  it("cuts where it's told, in order", () => {
    expect(pagesFromCuts(auto, [1800, 700]).map((p) => [p.y0, p.y1])).toEqual([[0, 700], [700, 1800], [1800, 2600]]);
  });

  it("ignores cuts outside the drawing", () => {
    expect(pagesFromCuts(auto, [-50, 3000])).toHaveLength(1);
  });

  it("keeps the gap between a group's boards out, and names pages after the board they're mostly on", () => {
    const group = [band(0, 1000, "a", 0, 400), band(2000, 3000, "b", 0, 800)];
    // One cut in the middle of the gap: each page ends where its board does.
    const pages = pagesFromCuts(group, [1500]);
    expect(pages).toEqual([band(0, 1000, "a", 0, 400), band(2000, 3000, "b", 0, 800)]);
    // A page spanning both boards is as wide as the wider.
    expect(pagesFromCuts(group, [500])[1]).toEqual(band(500, 3000, "b", 0, 800));
  });
});

describe("editing cuts", () => {
  it("keeps a moved cut away from its neighbours and the edges", () => {
    expect(moveCut([1000, 2000], 0, 1500, 0, 3000)).toEqual([1500, 2000]);
    expect(moveCut([1000, 2000], 0, 1990, 0, 3000)).toEqual([1950, 2000]);
    expect(moveCut([1000, 2000], 1, 5000, 0, 3000)).toEqual([1000, 2950]);
    expect(moveCut([1000, 2000], 0, -100, 0, 3000)).toEqual([50, 2000]);
  });

  it("adds a cut in order, but not right next to another", () => {
    expect(addCut([1000, 2000], 1500, 0, 3000)).toEqual([1000, 1500, 2000]);
    expect(addCut([1000, 2000], 1020, 0, 3000)).toEqual([1000, 2000]);
    expect(addCut([], 10, 0, 3000)).toEqual([]);
  });

  it("only cuts boards without frames", () => {
    expect(canCut([band(0, 1)])).toBe(true);
    expect(canCut([{ ...band(0, 1), frameId: "f" }])).toBe(false);
  });
});
