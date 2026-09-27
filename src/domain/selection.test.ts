import { describe, expect, it } from "vitest";

import { boxBetween, clipboardText, elementAt, elementsInBox, toScene, toScreen } from "./selection";
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
