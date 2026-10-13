import { describe, expect, it } from "vitest";

import type { Board } from "./scene";
import type { Sheet } from "./sheet";
import { noteAt } from "./notes";
import { workbookBoard, wrapText } from "./sheetScene";
import type { SceneElement } from "./types";

const measure = (text: string, size: number) => text.length * size * 0.5;
const BLACK = { fill: "#000000", color: "#ffffff" };

function board(over: Partial<Sheet>): Board {
  const sheet: Sheet = {
    name: "S",
    hidden: false,
    colWidths: [],
    defaultColWidth: 64,
    rowHeights: [],
    defaultRowHeight: 20,
    colStyles: [],
    rowStyles: [],
    cells: [],
    merges: [],
    pictures: [],
    notes: [],
    gridLines: true,
    ...over,
  };
  const made = workbookBoard("book.xlsx", [sheet], {}, measure);
  if (typeof made === "string") throw new Error(made);
  return made;
}

const ofType = (b: Board, type: string) => b.elements.filter((e) => e.type === type) as (SceneElement & Record<string, unknown>)[];

describe("workbookBoard", () => {
  it("gives each page its empty cells' colour, to paint the space below it", () => {
    expect(board({ colStyles: Array(10).fill(BLACK), cells: [{ row: 0, col: 0, text: "x", numeric: false }] }).pages?.[0].paper).toBe("#000000");
    expect(board({ cells: [{ row: 0, col: 0, text: "x", numeric: false }] }).pages?.[0].paper).toBe("#ffffff");
  });

  it("paints a column-painted sheet as one black shape, with no gridlines showing through", () => {
    const b = board({
      colStyles: Array(10).fill(BLACK),
      cells: [{ row: 0, col: 0, text: "Score", numeric: false, style: BLACK }, { row: 9, col: 9, text: "7", numeric: true, style: BLACK }],
    });
    const rects = ofType(b, "rectangle");
    expect(rects).toHaveLength(1);
    expect(rects[0].backgroundColor).toBe("#000000");
    expect(ofType(b, "line")).toHaveLength(0);
  });

  it("draws gridlines between plain white cells, as Excel does", () => {
    const b = board({ cells: [{ row: 2, col: 2, text: "x", numeric: false }] });
    expect(ofType(b, "line").length).toBeGreaterThan(0);
  });

  it("takes the column's style first, then the row's", () => {
    const b = board({
      colStyles: [{ fill: "#ff0000" }],
      rowStyles: [undefined, { fill: "#00ff00" }],
      cells: [{ row: 1, col: 1, text: "x", numeric: false }],
    });
    const fills = ofType(b, "rectangle").map((r) => r.backgroundColor);
    expect(fills).toContain("#ff0000");
    expect(fills).toContain("#00ff00");
  });

  it("aligns numbers right and text left by default", () => {
    const b = board({ cells: [{ row: 0, col: 0, text: "12", numeric: true }, { row: 1, col: 0, text: "ab", numeric: false }] });
    expect(ofType(b, "text").map((t) => t.textAlign)).toEqual(["right", "left"]);
  });

  it("puts each page below the last, named after its sheet", () => {
    const b = board({ cells: Array.from({ length: 200 }, (_, r) => ({ row: r, col: 0, text: `r${r}`, numeric: false })) });
    expect(b.pages!.length).toBeGreaterThan(1);
    expect(b.pages!.every((p) => p.name === "S")).toBe(true);
    for (let i = 1; i < b.pages!.length; i++) expect(b.pages![i].y0).toBeGreaterThan(b.pages![i - 1].y1);
    expect(b.exactColors).toBe(true);
  });
});

describe("cell notes", () => {
  // A note on C2 (an empty cell, as Excel allows), on a 64 x 20 grid: the cell spans x 128-192, y 20-40.
  const b = board({ cells: [{ row: 0, col: 0, text: "a", numeric: false }], notes: [{ row: 1, col: 2, text: "Alex:\nhes injured" }] });

  it("marks the cell with a red triangle in its top-right corner", () => {
    const marks = ofType(b, "line").filter((e) => e.backgroundColor === "#ff0000");
    expect(marks).toHaveLength(1);
    const [mark] = marks;
    expect(mark.x + (mark.width ?? 0)).toBe(192);
    expect(mark.y).toBe(b.pages![0].y0 + 20);
    // Closed, so Excalidraw fills it.
    expect(mark.points?.[0]).toEqual(mark.points?.at(-1));
  });

  it("finds the note under the mouse anywhere in its cell, and nowhere else", () => {
    const top = b.pages![0].y0;
    expect(noteAt(b.notes!, 130, top + 30)?.text).toBe("Alex:\nhes injured");
    expect(noteAt(b.notes!, 100, top + 30)).toBeUndefined();
    expect(noteAt(b.notes!, 130, top + 45)).toBeUndefined();
  });

  it("keeps a note on an otherwise empty cell on the page", () => {
    const far = board({ cells: [{ row: 0, col: 0, text: "a", numeric: false }], notes: [{ row: 30, col: 12, text: "x" }] });
    expect(far.notes).toHaveLength(1);
  });
});

describe("wrapText", () => {
  const fits = (s: string) => s.length <= 10;
  it("wraps at spaces and breaks words too long for a line", () => {
    expect(wrapText("one two three four", fits)).toEqual(["one two", "three four"]);
    expect(wrapText("abcdefghijklmnop", fits)).toEqual(["abcdefghij", "klmnop"]);
    expect(wrapText("a\nb", fits)).toEqual(["a", "b"]);
  });
});
