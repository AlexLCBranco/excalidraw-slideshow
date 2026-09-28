import { describe, expect, it } from "vitest";

import {
  boxBetween,
  clipboardText,
  elementAt,
  elementsInBox,
  elementsInLasso,
  extendSelection,
  toScene,
  toScreen,
} from "./selection";
import type { SceneElement } from "./types";

const rect = (id: string, x: number, y: number, extra: Partial<SceneElement> = {}): SceneElement => ({
  id,
  type: "rectangle",
  x,
  y,
  width: 10,
  height: 10,
  ...extra,
});

const ids = (els: SceneElement[]) => els.map((e) => e.id);

describe("elementsInBox", () => {
  it("picks only elements wholly inside the box", () => {
    const els = [rect("in", 0, 0), rect("half", 15, 0), rect("gone", 0, 0, { isDeleted: true })];
    expect(ids(elementsInBox(els, boxBetween(20, 20, -1, -1)))).toEqual(["in"]);
  });

  it("brings the rest of an outermost group and the text inside a shape", () => {
    const els = [
      rect("a", 0, 0, { groupIds: ["inner", "outer"] }),
      rect("b", 100, 0, { groupIds: ["outer"] }),
      rect("label", 500, 500, { containerId: "a" }),
      rect("other", 200, 0),
    ];
    expect(ids(elementsInBox(els, boxBetween(-1, -1, 20, 20)))).toEqual(["a", "b", "label"]);
  });
});

describe("elementsInLasso", () => {
  // An L-shaped loop: the bottom-right corner of its 100x100 square is cut out.
  const loop = [
    { x: -1, y: -1 },
    { x: 101, y: -1 },
    { x: 101, y: 50 },
    { x: 50, y: 50 },
    { x: 50, y: 101 },
    { x: -1, y: 101 },
  ];

  it("picks elements wholly inside the loop, even where a box around it would take more", () => {
    const els = [rect("top-left", 0, 0), rect("top-right", 80, 0), rect("bottom-left", 0, 80), rect("notch", 80, 80)];
    expect(ids(elementsInLasso(els, loop))).toEqual(["top-left", "top-right", "bottom-left"]);
  });

  it("skips elements the loop only crosses", () => {
    expect(elementsInLasso([rect("across", 45, 45)], loop)).toEqual([]);
  });

  it("needs a loop, not a line", () => {
    expect(elementsInLasso([rect("a", 0, 0)], loop.slice(0, 2))).toEqual([]);
  });
});

describe("extendSelection", () => {
  const els = [rect("a", 0, 0), rect("b", 20, 0), rect("c", 40, 0)];
  const [a, b, c] = els;

  it("replaces the selection without Shift", () => {
    expect(ids(extendSelection(els, [a], [b], { shift: false, click: false }))).toEqual(["b"]);
  });

  it("adds with Shift, keeping the board's order", () => {
    expect(ids(extendSelection(els, [c], [a], { shift: true, click: false }))).toEqual(["a", "c"]);
  });

  it("takes out an already selected element on Shift-click", () => {
    expect(ids(extendSelection(els, [a, b], [b], { shift: true, click: true }))).toEqual(["a"]);
  });

  it("keeps the selection on a Shift-click on empty space", () => {
    expect(ids(extendSelection(els, [a], [], { shift: true, click: true }))).toEqual(["a"]);
  });
});

describe("elementAt", () => {
  it("picks the topmost element under the point", () => {
    const els = [rect("below", 0, 0), rect("above", 5, 5)];
    expect(ids(elementAt(els, 7, 7))).toEqual(["above"]);
    expect(elementAt(els, 50, 50)).toEqual([]);
  });
});

describe("toScene / toScreen", () => {
  it("are inverses", () => {
    const camera = { zoom: 2, scrollX: 30, scrollY: -10 };
    const box = boxBetween(0, 0, 100, 50);
    expect(toScreen(camera, toScene(camera, box))).toEqual(box);
  });
});

describe("clipboardText", () => {
  it("keeps only the images the selection uses", () => {
    const text = clipboardText([rect("img", 0, 0, { type: "image", fileId: "f1" })], { f1: "one", f2: "two" });
    expect(JSON.parse(text)).toMatchObject({ type: "excalidraw/clipboard", files: { f1: "one" } });
    expect(JSON.parse(text).files.f2).toBeUndefined();
  });
});
