import { describe, expect, it } from "vitest";

import { type Cell, indexSheet, type Picture, type Sheet } from "./sheet";
import { evenSplit, PAGE_HEIGHT, PAGE_WIDTH, paginateSheet, paginateWorkbook, splitSpans, tabOf } from "./sheetPages";

/** A sheet of 20 px rows and 64 px columns, with text in the given cells ("r,c"). */
function sheet(over: Partial<Sheet> & { written?: string[] } = {}): Sheet {
  const cells: Cell[] = (over.written ?? []).map((rc) => {
    const [row, col] = rc.split(",").map(Number);
    return { row, col, text: `R${row}C${col}`, numeric: false };
  });
  return {
    name: "Sheet1",
    hidden: false,
    colWidths: [],
    defaultColWidth: 64,
    rowHeights: [],
    defaultRowHeight: 20,
    colStyles: [],
    rowStyles: [],
    cells,
    merges: [],
    pictures: [],
    notes: [],
    gridLines: true,
    ...over,
  };
}

/** Text in every cell of `rows` x `cols`. */
const grid = (rows: number, cols: number) =>
  Array.from({ length: rows * cols }, (_, i) => `${Math.floor(i / cols)},${i % cols}`);

const picture = (r0: number, c0: number, r1: number, c1: number): Picture => ({
  fileId: "pic",
  from: { row: r0, col: c0, rowOffset: 0, colOffset: 0 },
  to: { row: r1, col: c1, rowOffset: 10, colOffset: 10 },
});

const pagesOf = (s: Sheet) => paginateSheet(indexSheet(s));
/** The rows a page shows, apart from the repeated header. */
const own = (rows: number[], header = 0) => rows.filter((r) => r !== header);

describe("paginateSheet", () => {
  it("shows a short sheet on one page", () => {
    const pages = pagesOf(sheet({ written: grid(10, 5) }));
    expect(pages).toEqual([{ rows: [...Array(10).keys()], cols: [0, 1, 2, 3, 4] }]);
  });

  it("splits a long sheet into row chunks that fit, repeating the header row", () => {
    const pages = pagesOf(sheet({ written: grid(200, 3) })); // 4000 px tall
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      expect(p.rows[0]).toBe(0);
      expect(p.rows.length * 20).toBeLessThanOrEqual(PAGE_HEIGHT);
    }
    // Every row appears once (besides the header), in order.
    expect(pages.flatMap((p, i) => (i ? own(p.rows) : p.rows))).toEqual([...Array(200).keys()]);
  });

  it("splits a very wide sheet by columns", () => {
    const pages = pagesOf(sheet({ written: grid(5, 80) })); // 5120 px wide
    expect(pages.length).toBe(3);
    for (const p of pages) expect(p.cols.length * 64).toBeLessThanOrEqual(PAGE_WIDTH);
    expect(pages.flatMap((p) => p.cols)).toEqual([...Array(80).keys()]);
  });

  it("gives an empty sheet one page", () => {
    expect(pagesOf(sheet())).toHaveLength(1);
  });

  it("repeats merged header cells whole", () => {
    const s = sheet({ written: ["0,0", ...grid(200, 2).filter((rc) => !rc.startsWith("0,") && !rc.startsWith("1,"))], merges: [{ r0: 0, c0: 0, r1: 1, c1: 1 }] });
    const pages = pagesOf(s);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) expect(p.rows.slice(0, 2)).toEqual([0, 1]);
  });

  it("never cuts a picture that crosses where a page would break", () => {
    // Rows 0-99 written; a picture over rows 45-60 sits on the natural break at row 54.
    const pages = pagesOf(sheet({ written: grid(100, 2), pictures: [picture(45, 0, 60, 1)] }));
    const holding = pages.filter((p) => p.rows.some((r) => r >= 45 && r <= 60 && r !== 0));
    expect(holding).toHaveLength(1);
    expect(holding[0].rows).toEqual(expect.arrayContaining([...Array(16).keys()].map((i) => 45 + i)));
  });

  it("prefers to break just below a picture", () => {
    // A picture over rows 2-30 (fills most of a page), then text rows: the page ends under the picture.
    const pages = pagesOf(sheet({ written: grid(120, 2), pictures: [picture(2, 0, 30, 1)] }));
    expect(pages[0].rows.at(-1)).toBe(30);
  });

  it("gives a picture taller than a page a page of its own, uncut", () => {
    const pages = pagesOf(sheet({ written: ["0,0"], pictures: [picture(1, 0, 100, 1)] }));
    expect(pages.some((p) => p.rows.includes(1) && p.rows.includes(100))).toBe(true);
  });
});

describe("paginateWorkbook", () => {
  const long = sheet({ name: "Long", written: grid(200, 2) });
  const short = sheet({ name: "Short", written: grid(3, 3) });
  const hidden = sheet({ name: "Secret", hidden: true, written: grid(3, 3) });

  it("puts every sheet's pages one after another, in tab order", () => {
    const { pages, tabs } = paginateWorkbook([long, short]);
    expect(tabs.map((t) => t.name)).toEqual(["Long", "Short"]);
    expect(tabs[0].firstPage).toBe(0);
    expect(tabs[1].firstPage).toBe(pages.findIndex((p) => p.sheet === 1));
    expect(pages.at(-1)?.sheet).toBe(1);
  });

  it("skips hidden sheets", () => {
    const { pages, tabs } = paginateWorkbook([short, hidden, long]);
    expect(tabs.map((t) => t.name)).toEqual(["Short", "Long"]);
    expect(pages.some((p) => p.sheet === 1)).toBe(false);
  });

  it("→ from the last page of a sheet lands on the next sheet's first page, ← goes back", () => {
    const { pages, tabs } = paginateWorkbook([long, short]);
    const lastOfLong = tabs[1].firstPage - 1;
    expect(pages[lastOfLong].sheet).toBe(0);
    expect(tabOf(tabs, lastOfLong)).toBe(0);
    expect(tabOf(tabs, lastOfLong + 1)).toBe(1);
    expect(pages[lastOfLong + 1]).toEqual({ sheet: 1, rows: [0, 1, 2], cols: [0, 1, 2] });
    expect(tabOf(tabs, lastOfLong + 1 - 1)).toBe(0);
  });
});

describe("splitSpans", () => {
  it("cuts at the budget", () => {
    expect(splitSpans([10, 10, 10, 10], 20, [], [], 0)).toEqual([[0, 2], [2, 4]]);
  });

  it("keeps a span together", () => {
    expect(splitSpans([10, 10, 10, 10], 20, [[1, 2]], [], 0)).toEqual([[0, 1], [1, 3], [3, 4]]);
  });

  it("shares out evenly rather than leaving a sliver", () => {
    const sizes = Array(31).fill(64); // 1984 px: just too wide for one 1920 px page
    expect(splitSpans(sizes, PAGE_WIDTH, [], [], 0)).toEqual([[0, 30], [30, 31]]);
    expect(evenSplit(sizes, PAGE_WIDTH, [], [], 0)).toEqual([[0, 16], [16, 31]]);
  });

  it("leaves room for the repeated header after the first page", () => {
    expect(splitSpans([10, 10, 10, 10, 10], 30, [], [], 10)).toEqual([[0, 3], [3, 5]]);
  });
});
