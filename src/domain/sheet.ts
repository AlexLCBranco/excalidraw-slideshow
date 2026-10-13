/**
 * A spreadsheet sheet, read from an .xlsx file (lib/xlsx.ts) into plain data:
 * sizes in screen pixels, colours as "#rrggbb", rows and columns counted from 0.
 * Pages and drawing are worked out from this (sheetPages.ts, sheetScene.ts).
 */

export type BorderStyle = "thin" | "medium" | "thick" | "dashed" | "dotted" | "double" | "hair";

export interface Edge {
  style: BorderStyle;
  color: string;
}

export interface CellStyle {
  /** Background fill; none means the sheet's plain white. */
  fill?: string;
  /** Font colour; none means black. */
  color?: string;
  /** Font size in points. */
  sizePt?: number;
  /** Horizontal alignment; none means Excel's "General" (numbers right, text left). */
  align?: "left" | "center" | "right";
  vertical?: "top" | "middle" | "bottom";
  wrap?: boolean;
  borders?: { top?: Edge; right?: Edge; bottom?: Edge; left?: Edge };
}

export interface Cell {
  row: number;
  col: number;
  /** The value as Excel shows it (formulas show their saved result). "" for an empty cell. */
  text: string;
  /** Numbers are right-aligned by default. */
  numeric: boolean;
  /** The cell's own style. Missing when it has none, so it takes its column's, then its row's. */
  style?: CellStyle;
}

/** A corner of a picture: a cell, plus how far into it, in px. */
export interface Anchor {
  row: number;
  col: number;
  rowOffset: number;
  colOffset: number;
}

/** A picture floating over the cells, from its top-left corner to its bottom-right one. */
export interface Picture {
  /** Key into the board's files. */
  fileId: string;
  from: Anchor;
  to: Anchor;
}

/** A merged block of cells, inclusive. Its top-left cell holds the value and style. */
export interface Merge {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export interface Sheet {
  name: string;
  /** Hidden sheets (Excel's "Hide") are left out of the slideshow. */
  hidden: boolean;
  /** Column widths in px; columns not listed are `defaultColWidth`, hidden ones 0. */
  colWidths: readonly number[];
  defaultColWidth: number;
  rowHeights: readonly number[];
  defaultRowHeight: number;
  /** Whole-column and whole-row styles (selecting column A and painting it). */
  colStyles: readonly (CellStyle | undefined)[];
  rowStyles: readonly (CellStyle | undefined)[];
  cells: readonly Cell[];
  merges: readonly Merge[];
  pictures: readonly Picture[];
  /** Excel's "Gridlines" view option. */
  gridLines: boolean;
}

/** Excel's defaults: a 64 px column, a 20 px (15 pt) row. */
export const DEFAULT_COL_WIDTH = 64;
export const DEFAULT_ROW_HEIGHT = 20;

export const colWidth = (s: Sheet, c: number) => s.colWidths[c] ?? s.defaultColWidth;
export const rowHeight = (s: Sheet, r: number) => s.rowHeights[r] ?? s.defaultRowHeight;

/** Fast lookups into one sheet's cells. */
export interface SheetIndex {
  sheet: Sheet;
  cell: (r: number, c: number) => Cell | undefined;
  /** The merge covering a cell, if any. */
  merge: (r: number, c: number) => Merge | undefined;
  /** The style a cell is drawn with: its own, else its column's, else its row's. */
  style: (r: number, c: number) => CellStyle;
}

const key = (r: number, c: number) => r * 16384 + c;

export function indexSheet(sheet: Sheet): SheetIndex {
  const cells = new Map(sheet.cells.map((c) => [key(c.row, c.col), c]));
  const merges = new Map<number, Merge>();
  for (const m of sheet.merges) {
    for (let r = m.r0; r <= m.r1; r++) for (let c = m.c0; c <= m.c1; c++) merges.set(key(r, c), m);
  }
  const cell = (r: number, c: number) => cells.get(key(r, c));
  return {
    sheet,
    cell,
    merge: (r, c) => merges.get(key(r, c)),
    style: (r, c) => cell(r, c)?.style ?? sheet.colStyles[c] ?? sheet.rowStyles[r] ?? {},
  };
}

/** The last row and column of a picture: a corner exactly on a cell edge doesn't reach into that cell. */
export function pictureSpan(p: Picture) {
  return {
    r0: p.from.row,
    c0: p.from.col,
    r1: Math.max(p.from.row, p.to.rowOffset > 0 ? p.to.row : p.to.row - 1),
    c1: Math.max(p.from.col, p.to.colOffset > 0 ? p.to.col : p.to.col - 1),
  };
}

/** Rows and columns shown for a sheet with nothing in it. */
const EMPTY_ROWS = 20;
const EMPTY_COLS = 10;

/**
 * The part of a sheet worth showing, as row and column counts from A1: every
 * cell with a value or a look of its own (fill or border unlike its column's),
 * every merge and every picture. Whole-column styles reach all 16,384
 * columns, so they don't count. An empty sheet shows a small blank block.
 */
export function sheetExtent(index: SheetIndex): { rows: number; cols: number } {
  const { sheet } = index;
  let rows = 0, cols = 0;
  const reach = (r: number, c: number) => {
    rows = Math.max(rows, r + 1);
    cols = Math.max(cols, c + 1);
  };
  for (const cell of sheet.cells) {
    const own = cell.style;
    const plain = sheet.colStyles[cell.col] ?? sheet.rowStyles[cell.row];
    const stands = cell.text !== "" || (own && (own.fill !== plain?.fill || hasBorders(own)));
    if (stands) reach(cell.row, cell.col);
  }
  for (const m of sheet.merges) reach(m.r1, m.c1);
  for (const p of sheet.pictures) {
    const s = pictureSpan(p);
    reach(s.r1, s.c1);
  }
  if (!rows) return { rows: EMPTY_ROWS, cols: EMPTY_COLS };
  return { rows, cols };
}

const hasBorders = (s: CellStyle) => !!s.borders && Object.values(s.borders).some(Boolean);
