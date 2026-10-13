import ExcelJS from "exceljs";

import {
  type Anchor,
  type BorderStyle,
  type Cell,
  type CellStyle,
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  type Edge,
  type Merge,
  type Picture,
  type Sheet,
} from "../domain/sheet";

/** A workbook read into plain data, plus what couldn't be shown as it is in Excel. */
export interface ReadWorkbook {
  sheets: Sheet[];
  /** Pictures, in Excalidraw's files format, keyed by `Picture.fileId`. */
  files: Record<string, { id: string; mimeType: string; dataURL: string; created: number }>;
  /** Things in the file this app draws differently or not at all, for telling the owner. */
  unsupported: string[];
}

const EMU_PER_PX = 9525;
/** Excel's column width unit is the width of a digit in the default font: 7 px. */
const DIGIT_PX = 7;
const PX_PER_PT = 4 / 3;

/** Browsers can show these; Excel's older EMF/WMF vector pictures they can't. */
const PICTURE_TYPES: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/**
 * Reads an .xlsx file with ExcelJS, read-only. Formulas show the result Excel
 * saved with the file; nothing is recalculated. Returns an error message when
 * the file isn't a workbook.
 */
export async function readXlsx(name: string, data: ArrayBuffer): Promise<ReadWorkbook | string> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data);
  } catch {
    return `${name} isn't an Excel workbook ExcelJS can read.`;
  }
  const unsupported = new Set<string>();
  const colors = colorResolver(workbook);
  const style = (s: Partial<ExcelJS.Style> | undefined) => toStyle(s, colors, unsupported);
  const files: ReadWorkbook["files"] = {};

  const sheets = workbook.worksheets.map((ws): Sheet => {
    const props = ws.properties as Partial<ExcelJS.WorksheetProperties>;
    const defaultColWidth = props.defaultColWidth ? Math.round(props.defaultColWidth * DIGIT_PX) : DEFAULT_COL_WIDTH;
    const defaultRowHeight = props.defaultRowHeight ? props.defaultRowHeight * PX_PER_PT : DEFAULT_ROW_HEIGHT;

    const colWidths: number[] = [];
    const colStyles: (CellStyle | undefined)[] = [];
    (ws.columns ?? []).forEach((col, c) => {
      colWidths[c] = col.hidden ? 0 : col.width ? Math.round(col.width * DIGIT_PX) : defaultColWidth;
      colStyles[c] = style(col.style);
    });

    const rowHeights: number[] = [];
    const rowStyles: (CellStyle | undefined)[] = [];
    const cells: Cell[] = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      if (row.hidden) rowHeights[r - 1] = 0;
      else if (row.height) rowHeights[r - 1] = row.height * PX_PER_PT;
      rowStyles[r - 1] = style((row as unknown as { style?: Partial<ExcelJS.Style> }).style);
      // Every cell the file lists, empty ones included: an empty cell can still have a fill or borders.
      for (const model of row.model?.cells ?? []) {
        const cell = ws.getCell(String(model.address));
        const value = cellValue(cell, unsupported);
        cells.push({ row: r - 1, col: Number(cell.col) - 1, text: value.text, numeric: value.numeric, style: style(cell.style) });
      }
    });

    const merges = ((ws.model as { merges?: string[] }).merges ?? []).map(parseRange).filter((m) => m !== null);
    if ((ws as { conditionalFormattings?: unknown[] }).conditionalFormattings?.length) {
      unsupported.add("conditional formatting (cells show their own colours)");
    }

    const width = (c: number) => colWidths[c] ?? defaultColWidth;
    const height = (r: number) => rowHeights[r] ?? defaultRowHeight;
    const pictures: Picture[] = [];
    for (const img of ws.getImages()) {
      const media = workbook.getImage(Number(img.imageId)) as { extension?: string; buffer?: ArrayLike<number> };
      const mimeType = PICTURE_TYPES[media?.extension?.toLowerCase() ?? ""];
      if (!media?.buffer || !mimeType) {
        unsupported.add(`pictures in ${media?.extension?.toUpperCase() ?? "an unknown"} format`);
        continue;
      }
      const fileId = `xlsx-image-${img.imageId}`;
      files[fileId] ??= { id: fileId, mimeType, dataURL: dataUrl(mimeType, media.buffer), created: Date.now() };
      const range = img.range as unknown as ImageRange;
      const from = anchorOf(range.tl);
      const to = range.br ? anchorOf(range.br) : anchorAfter(from, range.ext?.width ?? 0, range.ext?.height ?? 0, width, height);
      pictures.push({ fileId, from, to });
    }

    return {
      name: ws.name,
      hidden: ws.state !== "visible",
      colWidths,
      defaultColWidth,
      rowHeights,
      defaultRowHeight,
      colStyles,
      rowStyles,
      cells,
      merges,
      pictures,
      gridLines: ws.views?.[0]?.showGridLines !== false,
    };
  });

  return { sheets, files, unsupported: [...unsupported] };
}

// ---- Values ----

/** What a cell shows: its value, or for a formula the result saved in the file. */
function cellValue(cell: ExcelJS.Cell, unsupported: Set<string>): { text: string; numeric: boolean } {
  const show = (v: unknown): { text: string; numeric: boolean } => {
    if (v === null || v === undefined) return { text: "", numeric: false };
    if (typeof v === "number") return { text: formatNumber(v, cell.numFmt), numeric: true };
    if (typeof v === "boolean") return { text: v ? "TRUE" : "FALSE", numeric: false };
    if (typeof v === "string") return { text: v, numeric: false };
    if (v instanceof Date) return { text: formatDate(v, cell.numFmt), numeric: true };
    if (typeof v === "object") {
      const o = v as { richText?: { text: string; font?: Partial<ExcelJS.Font> }[]; text?: unknown; error?: string; result?: unknown; formula?: string; sharedFormula?: string };
      if (o.richText) {
        if (new Set(o.richText.map((t) => JSON.stringify(t.font?.color ?? null))).size > 1) {
          unsupported.add("several colours in one cell (shown in one colour)");
        }
        return { text: o.richText.map((t) => t.text).join(""), numeric: false };
      }
      if (o.error) return { text: o.error, numeric: false };
      if ("formula" in o || "sharedFormula" in o) return show(o.result);
      if ("text" in o) return show(o.text);
    }
    return { text: String(v), numeric: false };
  };
  // Merged cells other than the top-left one repeat its value in ExcelJS; they show nothing.
  if (cell.type === ExcelJS.ValueType.Merge) return { text: "", numeric: false };
  return show(cell.value);
}

/** A number as a common Excel number format shows it; anything unusual falls back to plain digits. */
export function formatNumber(n: number, format = "General"): string {
  const section = format.split(";")[0];
  if (/[dmyhs]/i.test(section.replace(/"[^"]*"|\[[^\]]*\]/g, ""))) {
    return formatDate(new Date(Math.round((n - 25569) * 86400000)), section);
  }
  if (section === "General" || section === "@" || !/[0#]/.test(section)) {
    return String(Number(n.toPrecision(11)));
  }
  const percent = section.includes("%");
  const value = percent ? n * 100 : n;
  const decimals = (section.match(/\.([0#]+)/)?.[1] ?? "").length;
  const grouped = /#,##0|0,0/.test(section);
  const digits = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouped,
  });
  // Literal text around the digits, e.g. "R$ " or " kg".
  const literal = (s: string) => s.replace(/\[[^\]]*\]|_.|\\|\*./g, "").replace(/"([^"]*)"/g, "$1");
  const [, before = "", after = ""] = section.match(/^([^0#?]*)[0#,.?]+(.*)$/) ?? [];
  return `${value < 0 ? "-" : ""}${literal(before)}${digits}${literal(after.replace("%", ""))}${percent ? "%" : ""}`;
}

/** A date in the cell's format (days, months, years, hours, minutes), or dd/mm/yyyy. */
export function formatDate(d: Date, format = ""): string {
  const pad = (v: number, n = 2) => String(v).padStart(n, "0");
  const f = format.replace(/\[[^\]]*\]|"[^"]*"|\\/g, "").toLowerCase();
  if (!/[dmyh]/.test(f)) return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return f.replace(/yyyy|yy|mm|m|dd|d|hh|h|ss|s/g, (t, at: number) => {
    // "m" right after an hour, or right before seconds, means minutes.
    const minutes = /h[^dmy]*$/.test(f.slice(0, at)) || /^m+[^dy]*s/.test(f.slice(at));
    switch (t) {
      case "yyyy": return String(d.getUTCFullYear());
      case "yy": return pad(d.getUTCFullYear() % 100);
      case "mm": return minutes ? pad(d.getUTCMinutes()) : pad(d.getUTCMonth() + 1);
      case "m": return minutes ? String(d.getUTCMinutes()) : String(d.getUTCMonth() + 1);
      case "dd": return pad(d.getUTCDate());
      case "d": return String(d.getUTCDate());
      case "hh": return pad(d.getUTCHours());
      case "h": return String(d.getUTCHours());
      case "ss": return pad(d.getUTCSeconds());
      default: return String(d.getUTCSeconds());
    }
  });
}

// ---- Styles ----

function toStyle(s: Partial<ExcelJS.Style> | undefined, color: ColorResolver, unsupported: Set<string>): CellStyle | undefined {
  // ExcelJS gives an empty style to a cell with none of its own.
  if (!s || !Object.keys(s).length) return undefined;
  const out: CellStyle = {};

  const fill = s.fill;
  if (fill?.type === "pattern" && fill.pattern !== "none") {
    if (fill.pattern !== "solid") unsupported.add("patterned fills (shown as solid colour)");
    out.fill = color(fill.fgColor) ?? (fill.pattern === "solid" ? undefined : color(fill.bgColor));
  } else if (fill?.type === "gradient") {
    unsupported.add("gradient fills (shown as their first colour)");
    out.fill = color(fill.stops?.[0]?.color);
  }

  const font = s.font;
  if (font) {
    out.color = color(font.color);
    if (font.size) out.sizePt = font.size;
    if (font.bold || font.italic) unsupported.add("bold and italic text (shown plain)");
    if (font.underline || font.strike) unsupported.add("underlined or struck-through text (shown plain)");
  }

  const a = s.alignment;
  if (a) {
    const h = a.horizontal;
    if (h === "center" || h === "centerContinuous") out.align = "center";
    else if (h === "right") out.align = "right";
    else if (h) out.align = "left";
    const v = a.vertical;
    if (v === "top") out.vertical = "top";
    else if (v === "middle" || v === "distributed" || v === "justify") out.vertical = "middle";
    else if (v) out.vertical = "bottom";
    if (a.wrapText) out.wrap = true;
    if (a.textRotation) unsupported.add("rotated text (shown level)");
  }

  if (s.border) {
    const edge = (b: Partial<ExcelJS.Border> | undefined): Edge | undefined =>
      b?.style ? { style: borderStyle(b.style), color: color(b.color) ?? "#000000" } : undefined;
    const borders = { top: edge(s.border.top), right: edge(s.border.right), bottom: edge(s.border.bottom), left: edge(s.border.left) };
    if (Object.values(borders).some(Boolean)) out.borders = borders;
  }
  return out;
}

function borderStyle(s: ExcelJS.BorderStyle): BorderStyle {
  if (s === "thin" || s === "medium" || s === "thick" || s === "double" || s === "hair" || s === "dotted") return s;
  return "dashed";
}

type ColorResolver = (c: Partial<ExcelJS.Color> | undefined) => string | undefined;

/** Excel's 64 numbered colours (old files, and some borders), from "indexed". */
const INDEXED = (
  "000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF " +
  "000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 " +
  "9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF " +
  "00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 " +
  "003366 339966 003300 333300 993300 993366 333399 333333 000000 FFFFFF"
).split(" ");

/**
 * Turns Excel's colour references into "#rrggbb": plain ones, numbered ones,
 * and theme ones (with their lighter/darker tint). "Text 1" and "Background 1"
 * are always black and white, whatever the viewer's light or dark mode.
 */
function colorResolver(workbook: ExcelJS.Workbook): ColorResolver {
  const xml = (workbook.model as unknown as { themes?: Record<string, string> }).themes?.theme1 ?? "";
  const scheme: Record<string, string> = {};
  for (const m of xml.matchAll(/<a:(\w+)>\s*<a:(?:srgbClr val="([0-9A-Fa-f]{6})"|sysClr [^>]*lastClr="([0-9A-Fa-f]{6})")/g)) {
    scheme[m[1]] = m[2] ?? m[3];
  }
  // Styles number the theme's colours with the first two pairs swapped.
  const theme = ["FFFFFF", "000000", scheme.lt2 ?? "E8E8E8", scheme.dk2 ?? "0E2841",
    ...[1, 2, 3, 4, 5, 6].map((i) => scheme[`accent${i}`] ?? "808080"), scheme.hlink ?? "0000FF", scheme.folHlink ?? "800080"];

  return (c) => {
    if (!c) return undefined;
    let hex: string | undefined;
    if (c.argb) hex = c.argb.slice(-6);
    else if (c.theme !== undefined) hex = theme[c.theme];
    else if ((c as { indexed?: number }).indexed !== undefined) hex = INDEXED[(c as { indexed: number }).indexed];
    if (!hex) return undefined;
    const tint = (c as { tint?: number }).tint;
    return `#${(tint ? applyTint(hex, tint) : hex).toLowerCase()}`;
  };
}

/** Excel's tint: towards black (negative) or white (positive), by changing lightness. */
export function applyTint(hex: string, tint: number): string {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [r1, g1, b1].map((v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// ---- Places ----

interface ImageRange {
  tl: { nativeCol: number; nativeColOff: number; nativeRow: number; nativeRowOff: number };
  br?: ImageRange["tl"];
  ext?: { width: number; height: number };
}

const anchorOf = (a: ImageRange["tl"]): Anchor => ({
  row: a.nativeRow,
  col: a.nativeCol,
  rowOffset: a.nativeRowOff / EMU_PER_PX,
  colOffset: a.nativeColOff / EMU_PER_PX,
});

/** The corner `width` x `height` px right of and below `from`, for pictures stored by size. */
function anchorAfter(from: Anchor, width: number, height: number, colWidth: (c: number) => number, rowHeight: (r: number) => number): Anchor {
  let col = from.col, colOffset = from.colOffset + width;
  while (colOffset > colWidth(col) && colWidth(col) > 0) colOffset -= colWidth(col++);
  let row = from.row, rowOffset = from.rowOffset + height;
  while (rowOffset > rowHeight(row) && rowHeight(row) > 0) rowOffset -= rowHeight(row++);
  return { row, col, rowOffset, colOffset };
}

/** "B2:C3" as 0-based inclusive rows and columns. */
function parseRange(ref: string): Merge | null {
  const m = ref.match(/^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i);
  if (!m) return null;
  const col = (s: string) => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return { r0: Number(m[2]) - 1, c0: col(m[1]), r1: Number(m[4]) - 1, c1: col(m[3]) };
}

function dataUrl(mimeType: string, bytes: ArrayLike<number>) {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.prototype.slice.call(bytes, i, i + CHUNK));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
