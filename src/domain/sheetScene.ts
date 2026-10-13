import type { BoardNote } from "./notes";
import type { Board } from "./scene";
import { type CellStyle, colWidth, type Edge, indexSheet, rowHeight, type Sheet, type SheetIndex } from "./sheet";
import { paginateWorkbook, type SheetPage } from "./sheetPages";
import type { Page, SceneElement } from "./types";

/** Width of `text` in px at `fontSize` px, in the font cells are drawn with. */
export type Measure = (text: string, fontSize: number) => number;

/** Excalidraw's Helvetica, the plainest font it has. Drawn by the system's own (Arial on Windows). */
export const CELL_FONT = 2;
/** Excalidraw's line height for that font. */
const LINE_HEIGHT = 1.15;
/** Space between a cell's edge and its text, as in Excel. */
const TEXT_PAD = 3;
/** Excel's defaults: 11 pt black text on white, light grey gridlines. */
const DEFAULT_SIZE_PT = 11;
const BLACK = "#000000";
const WHITE = "#ffffff";
const GRIDLINE = "#d4d4d4";
/** Excel's mark for a cell with a note: a small red triangle in its top-right corner. */
const NOTE_MARK = "#ff0000";
const NOTE_MARK_SIZE = 7;
/** Empty space between two pages in the scene; masks hide it while presenting. */
const PAGE_GAP = 200;

const STROKE: Record<Edge["style"], { width: number; style: string }> = {
  hair: { width: 0.5, style: "solid" },
  thin: { width: 1, style: "solid" },
  medium: { width: 2, style: "solid" },
  thick: { width: 3, style: "solid" },
  double: { width: 3, style: "solid" },
  dashed: { width: 1, style: "dashed" },
  dotted: { width: 1, style: "dotted" },
};

/**
 * A workbook as a board: every page of every visible sheet laid out one below
 * the other, as Excalidraw shapes (cell fills, borders, text, pictures). The
 * pages are fixed here rather than found later, and the sheet tabs say where
 * each sheet starts. `files` holds the pictures, keyed by their `fileId`.
 */
export function workbookBoard(
  name: string,
  sheets: readonly Sheet[],
  files: Record<string, unknown>,
  measure: Measure,
): Board | string {
  const { pages, tabs } = paginateWorkbook(sheets);
  if (!pages.length) return `${name} has no visible sheets.`;
  const indexes = sheets.map(indexSheet);
  const elements: SceneElement[] = [];
  const notes: BoardNote[] = [];
  const boardPages: Page[] = [];
  let top = 0;
  pages.forEach((page, i) => {
    const drawn = drawPage(indexes[page.sheet], page, `${i}:`, top, measure);
    elements.push(...drawn.elements);
    notes.push(...drawn.notes);
    boardPages.push({ x0: 0, y0: top, x1: drawn.width, y1: top + drawn.height, name: sheets[page.sheet].name });
    top += drawn.height + PAGE_GAP;
  });
  return { name, elements, files, background: WHITE, pages: boardPages, tabs, notes, exactColors: true };
}

/** One page's shapes, with its top-left corner at (0, `top`). */
function drawPage(index: SheetIndex, page: SheetPage, prefix: string, top: number, measure: Measure) {
  const { sheet } = index;
  const xs = positions(page.cols, (c) => colWidth(sheet, c), 0);
  const ys = positions(page.rows, (r) => rowHeight(sheet, r), top);
  const width = xs.end;
  const height = ys.end - top;
  const out: SceneElement[] = [];
  let n = 0;
  const id = () => `${prefix}${n++}`;

  // The page is painted in its most common fill (often a whole-column colour), so
  // only cells that differ need shapes of their own, and no seams show between them.
  const paper = mostCommonFill(index, page, xs.at, ys.at);
  out.push(rect(id(), 0, top, width, height, paper));

  // Fills: runs of equal colour along each row, joined downwards when the next row has the same run.
  const open = new Map<string, SceneElement & { height: number }>();
  page.rows.forEach((r, i) => {
    const reached = new Map<string, SceneElement & { height: number }>();
    let j = 0;
    while (j < page.cols.length) {
      const fill = fillAt(index, r, page.cols[j]);
      let k = j + 1;
      while (k < page.cols.length && fillAt(index, r, page.cols[k]) === fill) k++;
      if (fill !== MERGED && fill !== paper) {
        const runKey = `${j}-${k}-${fill}`;
        const above = open.get(runKey);
        const h = ys.at[i + 1] - ys.at[i];
        if (above && above.y + above.height === ys.at[i]) {
          above.height += h;
          reached.set(runKey, above);
        } else {
          const r0 = rect(id(), xs.at[j], ys.at[i], xs.at[k] - xs.at[j], h, fill);
          out.push(r0);
          reached.set(runKey, r0);
        }
      }
      j = k;
    }
    open.clear();
    for (const [k, v] of reached) open.set(k, v);
  });

  // Merged cells: one block in the top-left cell's fill, hiding the gridlines inside.
  const merges = sheet.merges.filter((m) => xs.pos.has(m.c0) && ys.pos.has(m.r0));
  for (const m of merges) {
    const box = blockBox(m.r0, m.c0, m.r1, m.c1);
    out.push(rect(id(), box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0, index.style(m.r0, m.c0).fill ?? WHITE));
  }

  if (sheet.gridLines) out.push(...gridLines(index, page, xs.at, ys.at, id));
  out.push(...borders(index, page, xs.at, ys.at, id));

  for (const [i, r] of page.rows.entries()) {
    for (const [j, c] of page.cols.entries()) {
      const cell = index.cell(r, c);
      if (!cell?.text) continue;
      const merge = index.merge(r, c);
      if (merge && (merge.r0 !== r || merge.c0 !== c)) continue;
      const box = merge ? blockBox(merge.r0, merge.c0, merge.r1, merge.c1) : { x0: xs.at[j], x1: xs.at[j + 1], y0: ys.at[i], y1: ys.at[i + 1] };
      const style = index.style(r, c);
      const align = style.align ?? (cell.numeric ? "right" : "left");
      if (!merge && !style.wrap) {
        // Unwrapped text runs on into empty neighbours, as in Excel.
        const free = (jj: number) => jj >= 0 && jj < page.cols.length && !index.cell(r, page.cols[jj])?.text && !index.merge(r, page.cols[jj]);
        let left = j, right = j;
        if (align !== "right") while (free(right + 1)) right++;
        if (align !== "left") while (free(left - 1)) left--;
        if (align === "center") {
          const reach = Math.min(j - left, right - j);
          left = j - reach;
          right = j + reach;
        }
        box.x0 = xs.at[left];
        box.x1 = xs.at[right + 1];
      }
      const text = cellText(id(), cell.text, style, align, box, measure);
      if (text) out.push(text);
    }
  }

  for (const p of sheet.pictures) {
    if (!xs.pos.has(p.from.col) || !ys.pos.has(p.from.row)) continue;
    const x0 = xs.edge(p.from.col) + p.from.colOffset;
    const y0 = ys.edge(p.from.row) + p.from.rowOffset;
    const x1 = xs.edge(p.to.col) + p.to.colOffset;
    const y1 = ys.edge(p.to.row) + p.to.rowOffset;
    out.push(image(id(), x0, y0, x1 - x0, y1 - y0, p.fileId));
  }

  // Notes: a red corner mark on the cell (the whole block, if merged); the words show on hover.
  const notes: BoardNote[] = [];
  for (const note of sheet.notes) {
    if (!xs.pos.has(note.col) || !ys.pos.has(note.row)) continue;
    const merge = index.merge(note.row, note.col);
    const box = merge ? blockBox(merge.r0, merge.c0, merge.r1, merge.c1) : blockBox(note.row, note.col, note.row, note.col);
    out.push(triangle(id(), box.x1, box.y0, NOTE_MARK_SIZE, NOTE_MARK));
    notes.push({ ...box, text: note.text });
  }

  return { elements: out, notes, width, height };

  function blockBox(r0: number, c0: number, r1: number, c1: number) {
    return { x0: xs.edge(c0), y0: ys.edge(r0), x1: xs.edge(c1 + 1), y1: ys.edge(r1 + 1) };
  }
}

/**
 * Where each shown row (or column) starts, in page order, and the end of the
 * last. `edge(k)` is where row k starts on this page; for the row just past
 * the page it is the page's far edge.
 */
function positions(items: readonly number[], size: (k: number) => number, start: number) {
  const at = [start];
  const pos = new Map<number, number>();
  for (const k of items) {
    // A header row repeated above the page's own rows keeps its first position.
    if (!pos.has(k)) pos.set(k, at.length - 1);
    at.push(at[at.length - 1] + size(k));
  }
  const end = at[at.length - 1];
  const last = items[items.length - 1];
  const edge = (k: number) => {
    const i = pos.get(k);
    if (i !== undefined) return at[i];
    return k > last ? end : start;
  };
  return { at, pos, end, edge };
}

/** Stands for cells inside a merge, which draws its own block. */
const MERGED = "merged";

/** The colour a cell is painted: its fill, white for none, or MERGED. */
function fillAt(index: SheetIndex, r: number, c: number) {
  return index.merge(r, c) ? MERGED : (index.style(r, c).fill ?? WHITE);
}

/** The fill covering the most of a page. */
function mostCommonFill(index: SheetIndex, page: SheetPage, xs: readonly number[], ys: readonly number[]) {
  const area = new Map<string, number>();
  page.rows.forEach((r, i) =>
    page.cols.forEach((c, j) => {
      const fill = fillAt(index, r, c);
      area.set(fill, (area.get(fill) ?? 0) + (xs[j + 1] - xs[j]) * (ys[i + 1] - ys[i]));
    }),
  );
  area.delete(MERGED);
  let best = WHITE, most = -1;
  for (const [fill, a] of area) {
    if (a > most) [best, most] = [fill, a];
  }
  return best;
}

/**
 * Excel's light grey gridlines: only between two unfilled cells (a fill hides
 * them), never inside a merge, joined into long lines where they run on.
 */
function gridLines(index: SheetIndex, page: SheetPage, xs: readonly number[], ys: readonly number[], id: () => string) {
  const out: SceneElement[] = [];
  const rows = page.rows, cols = page.cols;
  const plain = (i: number, j: number) => i < 0 || j < 0 || i >= rows.length || j >= cols.length || (!index.merge(rows[i], cols[j]) && !index.style(rows[i], cols[j]).fill);
  // Horizontal lines above each row but the first; vertical ones left of each column but the first.
  for (let i = 1; i < rows.length; i++) {
    let from = -1;
    for (let j = 0; j <= cols.length; j++) {
      const shown = j < cols.length && plain(i - 1, j) && plain(i, j);
      if (shown && from === -1) from = j;
      if (!shown && from !== -1) {
        out.push(line(id(), xs[from], ys[i], xs[j] - xs[from], 0, GRIDLINE, STROKE.thin));
        from = -1;
      }
    }
  }
  for (let j = 1; j < cols.length; j++) {
    let from = -1;
    for (let i = 0; i <= rows.length; i++) {
      const shown = i < rows.length && plain(i, j - 1) && plain(i, j);
      if (shown && from === -1) from = i;
      if (!shown && from !== -1) {
        out.push(line(id(), xs[j], ys[from], 0, ys[i] - ys[from], GRIDLINE, STROKE.thin));
        from = -1;
      }
    }
  }
  return out;
}

/**
 * Cell borders as lines. An edge shared by two cells is drawn once (the
 * upper or left cell's border wins), edges inside a merge are skipped, and
 * neighbouring edges with the same look are joined into one line.
 */
function borders(index: SheetIndex, page: SheetPage, xs: readonly number[], ys: readonly number[], id: () => string) {
  const out: SceneElement[] = [];
  const rows = page.rows, cols = page.cols;
  const inside = (r0: number, c0: number, r1: number, c1: number) => {
    const a = index.merge(r0, c0);
    return !!a && a === index.merge(r1, c1);
  };
  // Horizontal edges: above row i (i = rows.length is the bottom edge).
  for (let i = 0; i <= rows.length; i++) {
    let run: { j: number; edge: Edge } | null = null;
    const flush = (j: number) => {
      if (run) out.push(line(id(), xs[run.j], ys[i], xs[j] - xs[run.j], 0, run.edge.color, STROKE[run.edge.style]));
      run = null;
    };
    for (let j = 0; j < cols.length; j++) {
      const above = i > 0 ? index.style(rows[i - 1], cols[j]).borders?.bottom : undefined;
      const below = i < rows.length ? index.style(rows[i], cols[j]).borders?.top : undefined;
      const skip = i > 0 && i < rows.length && inside(rows[i - 1], cols[j], rows[i], cols[j]);
      const edge = skip ? undefined : (above ?? below);
      if (run && (!edge || !sameEdge(run.edge, edge))) flush(j);
      if (edge && !run) run = { j, edge };
    }
    flush(cols.length);
  }
  // Vertical edges: left of column j.
  for (let j = 0; j <= cols.length; j++) {
    let run: { i: number; edge: Edge } | null = null;
    const flush = (i: number) => {
      if (run) out.push(line(id(), xs[j], ys[run.i], 0, ys[i] - ys[run.i], run.edge.color, STROKE[run.edge.style]));
      run = null;
    };
    for (let i = 0; i < rows.length; i++) {
      const left = j > 0 ? index.style(rows[i], cols[j - 1]).borders?.right : undefined;
      const right = j < cols.length ? index.style(rows[i], cols[j]).borders?.left : undefined;
      const skip = j > 0 && j < cols.length && inside(rows[i], cols[j - 1], rows[i], cols[j]);
      const edge = skip ? undefined : (left ?? right);
      if (run && (!edge || !sameEdge(run.edge, edge))) flush(i);
      if (edge && !run) run = { i, edge };
    }
    flush(rows.length);
  }
  return out;
}

const sameEdge = (a: Edge, b: Edge) => a.style === b.style && a.color === b.color;

/** A cell's text, aligned in `box` as Excel would, wrapped or cut to fit. */
function cellText(
  id: string,
  value: string,
  style: CellStyle,
  align: "left" | "center" | "right",
  box: { x0: number; x1: number; y0: number; y1: number },
  measure: Measure,
): SceneElement | null {
  const fontSize = ((style.sizePt ?? DEFAULT_SIZE_PT) * 4) / 3;
  const lineHeight = fontSize * LINE_HEIGHT;
  const room = box.x1 - box.x0 - 2 * TEXT_PAD;
  if (room <= 0) return null;
  const fits = (s: string) => measure(s, fontSize) <= room;
  let lines = style.wrap ? wrapText(value, fits) : [clip(value.replace(/\s*\n\s*/g, " "), fits, align === "right")];
  // Text taller than its cell is cut at the cell's bottom, keeping at least one line.
  const maxLines = Math.max(1, Math.floor((box.y1 - box.y0) / lineHeight));
  lines = lines.slice(0, maxLines);
  const height = lines.length * lineHeight;
  const vertical = style.vertical ?? "bottom";
  const y =
    vertical === "top" ? box.y0 + 1 : vertical === "middle" ? (box.y0 + box.y1 - height) / 2 : box.y1 - height - 1;
  const text = lines.join("\n");
  return {
    ...base(id, "text", box.x0 + TEXT_PAD, y, room, height),
    strokeColor: style.color ?? BLACK,
    text,
    originalText: text,
    fontSize,
    fontFamily: CELL_FONT,
    textAlign: align,
    verticalAlign: "top",
    containerId: null,
    lineHeight: LINE_HEIGHT,
    autoResize: false,
  } as SceneElement;
}

/** Splits text into lines that fit, word by word; a word too long for a line is broken. */
export function wrapText(value: string, fits: (s: string) => boolean): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      const joined = line ? `${line} ${word}` : word;
      if (fits(joined)) {
        line = joined;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (line.length > 1 && !fits(line)) {
        let cut = line.length - 1;
        while (cut > 1 && !fits(line.slice(0, cut))) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Text cut to fit, from the end (or from the start, for right-aligned text, as Excel does). */
function clip(value: string, fits: (s: string) => boolean, fromStart: boolean) {
  let s = value;
  while (s.length > 1 && !fits(s)) s = fromStart ? s.slice(1) : s.slice(0, -1);
  return s;
}

// ---- Excalidraw shapes. Excalidraw fills in anything else when it loads them. ----

function base(id: string, type: string, x: number, y: number, width: number, height: number) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    roundness: null,
    groupIds: [],
    frameId: null,
    boundElements: null,
    // Nothing on a sheet can be moved, even by accident.
    locked: true,
    link: null,
    isDeleted: false,
  };
}

function rect(id: string, x: number, y: number, width: number, height: number, fill: string) {
  return { ...base(id, "rectangle", x, y, width, height), backgroundColor: fill } as SceneElement & { height: number };
}

function line(id: string, x: number, y: number, dx: number, dy: number, color: string, stroke: { width: number; style: string }) {
  return {
    ...base(id, "line", x, y, Math.abs(dx), Math.abs(dy)),
    strokeColor: color,
    strokeWidth: stroke.width,
    strokeStyle: stroke.style,
    points: [
      [0, 0],
      [dx, dy],
    ],
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
  } as SceneElement;
}

/** A filled right triangle tucked into the corner at (x, y): along the top edge and down the right one. */
function triangle(id: string, x: number, y: number, size: number, color: string) {
  return {
    ...base(id, "line", x - size, y, size, size),
    strokeColor: "transparent",
    backgroundColor: color,
    // A closed line is filled.
    points: [
      [0, 0],
      [size, 0],
      [size, size],
      [0, 0],
    ],
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
  } as SceneElement;
}

function image(id: string, x: number, y: number, width: number, height: number, fileId: string) {
  return { ...base(id, "image", x, y, width, height), fileId, status: "saved", scale: [1, 1], crop: null } as SceneElement;
}
