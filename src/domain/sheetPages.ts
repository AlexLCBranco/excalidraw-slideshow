import { colWidth, indexSheet, pictureSpan, rowHeight, type Sheet, type SheetIndex, sheetExtent } from "./sheet";

/**
 * The most a spreadsheet page holds, in px at 100%: what Excel shows of a
 * sheet on a 1080p screen, which is the screen less the window's title bar
 * and the slideshow's bottom strip. A full page is shown at Excel's own size.
 */
export const PAGE_WIDTH = 1920;
export const PAGE_HEIGHT = 960;
/** A page may stop early at the bottom of a picture once it's this full. */
const MIN_FILL = 0.85;
/** A header taller than this share of a page isn't repeated: it would crowd out the rows. */
const MAX_HEADER = 0.25;
/** How much an even share of a sheet grows per try, until it fits in as few pages as filling them would. */
const EVEN_STEP = 1.05;

/** One page of a sheet: the rows and columns it shows, in order. */
export interface SheetPage {
  /** Index into the workbook's sheets. */
  sheet: number;
  /** The header rows (repeated from the first page), then this page's own rows. */
  rows: number[];
  cols: number[];
}

/** A tab in the sheet bar: a visible sheet and the first page it starts on. */
export interface SheetTab {
  name: string;
  firstPage: number;
}

/** An inclusive run of rows or columns that must stay on one page. */
type Span = readonly [number, number];

/**
 * Every visible sheet's pages, one after another in workbook order, so ←/→
 * walk from the last page of one sheet onto the first page of the next.
 * Hidden sheets are left out. A sheet is always at least one page.
 */
export function paginateWorkbook(sheets: readonly Sheet[]): { pages: SheetPage[]; tabs: SheetTab[] } {
  const pages: SheetPage[] = [];
  const tabs: SheetTab[] = [];
  sheets.forEach((sheet, i) => {
    if (sheet.hidden) return;
    tabs.push({ name: sheet.name, firstPage: pages.length });
    for (const p of paginateSheet(indexSheet(sheet))) pages.push({ sheet: i, ...p });
  });
  return { pages, tabs };
}

/** The tab a page belongs to. */
export const tabOf = (tabs: readonly SheetTab[], page: number) =>
  Math.max(0, tabs.findLastIndex((t) => t.firstPage <= page));

/**
 * Splits one sheet into pages that fit `PAGE_WIDTH` x `PAGE_HEIGHT`: bands of
 * rows, each cut into blocks of columns when the sheet is too wide, read left
 * to right, then down. Like scrolling down a screenful in Excel, each band
 * takes as many rows as fit; columns are shared out evenly, so no page is a sliver. A picture or merged cell is never cut: the rows and
 * columns it covers stay on one page, even when that makes the page bigger.
 * The header row is repeated at the top of every later page.
 */
export function paginateSheet(index: SheetIndex): { rows: number[]; cols: number[] }[] {
  const { sheet } = index;
  const extent = sheetExtent(index);
  const heights = range(extent.rows).map((r) => rowHeight(sheet, r));
  const widths = range(extent.cols).map((c) => colWidth(sheet, c));

  const pictures = sheet.pictures.map(pictureSpan);
  const rowBands: Span[] = pictures.map((p) => [p.r0, p.r1]);
  const colBands: Span[] = pictures.map((p) => [p.c0, p.c1]);
  const rowKeep = [...rowBands, ...sheet.merges.map((m): Span => [m.r0, m.r1])];
  const colKeep = [...colBands, ...sheet.merges.map((m): Span => [m.c0, m.c1])];

  const header = headerRows(index, rowBands);
  const headerHeight = header ? sum(heights, header[0], header[1] + 1) : 0;

  const rowChunks = splitSpans(heights, PAGE_HEIGHT, rowKeep, rowBands, headerHeight);
  const colChunks = evenSplit(widths, PAGE_WIDTH, colKeep, colBands, 0);

  return rowChunks.flatMap(([r0, r1]) => {
    const own = range(r1 - r0).map((i) => r0 + i);
    const rows = header && r0 > header[1] ? [...range(header[1] - header[0] + 1).map((i) => header[0] + i), ...own] : own;
    return colChunks.map(([c0, c1]) => ({ rows, cols: range(c1 - c0).map((i) => c0 + i) }));
  });
}

/**
 * The header: the first row with anything written in it, stretched down over
 * any merged cells that start in it. None if a picture covers it (repeating it
 * would repeat part of the picture), or if it's too tall to repeat.
 */
function headerRows(index: SheetIndex, pictureRows: readonly Span[]): Span | null {
  const written = index.sheet.cells.filter((c) => c.text !== "");
  if (!written.length) return null;
  const r0 = Math.min(...written.map((c) => c.row));
  const r1 = Math.max(r0, ...index.sheet.merges.filter((m) => m.r0 === r0).map((m) => m.r1));
  if (pictureRows.some(([a, b]) => a <= r1 && b >= r0)) return null;
  let height = 0;
  for (let r = r0; r <= r1; r++) height += rowHeight(index.sheet, r);
  return height <= PAGE_HEIGHT * MAX_HEADER ? [r0, r1] : null;
}

/**
 * Cuts `sizes` (row heights or column widths) into consecutive [start, end)
 * runs of at most `budget` each. A cut never falls inside a `keep` span; a
 * span bigger than the budget gets a page of its own, as big as it needs.
 * When a page can end at the bottom of a picture (a `bands` span) and still be
 * nearly full, it does, so pictures and the text around them aren't
 * split awkwardly. Every page after the first loses `reserve` (the repeated
 * header) from its budget.
 */
export function splitSpans(
  sizes: readonly number[],
  budget: number,
  keep: readonly Span[],
  bands: readonly Span[],
  reserve: number,
): [number, number][] {
  const n = sizes.length;
  if (!n) return [[0, 0]];
  const canCut = (i: number) => i === n || !keep.some(([a, b]) => a < i && b >= i);
  const pictureEnds = new Set(bands.map(([, b]) => b + 1));

  const chunks: [number, number][] = [];
  let start = 0;
  while (start < n) {
    const room = chunks.length ? budget - reserve : budget;
    let end = -1;
    let total = 0;
    let preferred = -1;
    for (let i = start + 1; i <= n; i++) {
      total += sizes[i - 1];
      if (total > room) break;
      if (!canCut(i)) continue;
      end = i;
      if (pictureEnds.has(i) && total >= room * MIN_FILL) preferred = i;
    }
    if (end === -1) {
      // Even the first possible cut overflows: a picture (or merge) taller than a page.
      end = start + 1;
      while (!canCut(end)) end++;
    } else if (end < n && preferred !== -1) {
      end = preferred;
    }
    chunks.push([start, end]);
    start = end;
  }
  return chunks;
}

/**
 * Like `splitSpans`, but sharing the size out evenly: a sheet a little too
 * wide for one page becomes two half-width pages, not a full page and a sliver.
 * The page budget shrinks only while that doesn't add a page.
 */
export function evenSplit(
  sizes: readonly number[],
  budget: number,
  keep: readonly Span[],
  bands: readonly Span[],
  reserve: number,
): [number, number][] {
  const greedy = splitSpans(sizes, budget, keep, bands, reserve);
  const n = greedy.length;
  if (n < 2) return greedy;
  const share = (sum(sizes, 0, sizes.length) + reserve * (n - 1)) / n;
  for (let b = share; b < budget; b *= EVEN_STEP) {
    const chunks = splitSpans(sizes, b, keep, bands, reserve);
    if (chunks.length <= n) return chunks;
  }
  return greedy;
}

const range = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => i);

function sum(values: readonly number[], from: number, to: number) {
  let total = 0;
  for (let i = from; i < to; i++) total += values[i] ?? 0;
  return total;
}
