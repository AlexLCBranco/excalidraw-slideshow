import { describe, expect, it } from "vitest";

import {
  type Addition,
  cornerScale,
  isAdded,
  moved,
  newId,
  placeImage,
  removeAddition,
  replaceAddition,
  scaled,
  textSizeFor,
  validAdditions,
} from "./additions";

const page = { x0: 0, y0: 1000, x1: 2000, y1: 2000, name: "" };
const text: Addition = { kind: "text", id: "added:a", x: 10, y: 20, text: "hi", fontSize: 35 };
const image: Addition = { kind: "image", id: "added:b", x: 0, y: 0, width: 10, height: 10, dataURL: "data:image/png;base64,", mimeType: "image/png" };

describe("additions", () => {
  it("marks every id as added, so the board's own elements are never touched", () => {
    expect(isAdded(newId())).toBe(true);
    expect(isAdded("abc123")).toBe(false);
    expect(newId(1, 0.5)).not.toBe(newId(2, 0.5));
  });

  it("sizes text to the page", () => {
    expect(textSizeFor(page)).toBe(35);
  });

  it("centres a picture on the page, shrunk to fit but never enlarged", () => {
    expect(placeImage(page, 100, 50)).toEqual({ x0: 950, y0: 1475, x1: 1050, y1: 1525 });
    const big = placeImage(page, 4000, 1000);
    expect(big.x1 - big.x0).toBeCloseTo(1200);
    expect(big.y1 - big.y0).toBeCloseTo(300);
    expect((big.x0 + big.x1) / 2).toBeCloseTo(1000);
    expect((big.y0 + big.y1) / 2).toBeCloseTo(1500);
  });

  it("moves and removes only the addition named", () => {
    expect(replaceAddition([text, image], moved(text, 5, -5))).toEqual([{ ...text, x: 15, y: 15 }, image]);
    expect(removeAddition([text, image], "added:a")).toEqual([image]);
  });

  it("resizes from the top-left corner: text by its size, a picture keeping its shape", () => {
    expect(scaled(text, 2)).toEqual({ ...text, fontSize: 70 });
    expect(scaled({ ...image, width: 200, height: 100 }, 0.5)).toMatchObject({ x: 0, y: 0, width: 100, height: 50 });
    // Never shrunk out of sight.
    expect(scaled(text, 0)).toMatchObject({ fontSize: 4 });
    expect(scaled({ ...image, width: 200, height: 100 }, 0)).toMatchObject({ width: 8, height: 4 });
  });

  it("measures a corner drag by whichever direction went further", () => {
    const box = { x0: 100, y0: 100, x1: 300, y1: 200 };
    expect(cornerScale(box, 500, 150)).toBe(2);
    expect(cornerScale(box, 150, 300)).toBe(2);
    expect(cornerScale(box, 0, 0)).toBe(0);
  });

  it("keeps only well-formed additions from storage", () => {
    expect(validAdditions(null)).toEqual([]);
    expect(validAdditions([text, image, { kind: "text", id: "board-element", x: 0, y: 0, text: "x", fontSize: 1 }, { kind: "image", id: "added:c" }, 7])).toEqual([text, image]);
  });
});
