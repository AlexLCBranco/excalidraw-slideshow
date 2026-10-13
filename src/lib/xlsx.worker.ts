/// <reference lib="webworker" />
import type { Board } from "../domain/scene";
import { CELL_FONT, workbookBoard } from "../domain/sheetScene";
import { readXlsx } from "./xlsx";

/**
 * Reads a workbook off the main thread: unzipping and parsing a large .xlsx
 * takes seconds, and the app (and its "Opening…" spinner) must keep running.
 * Receives { name, data }, answers { board } or { error }.
 */
export type XlsxReply = { board: Board } | { error: string };

// Must match how Excalidraw draws the cell font (`getFontString`), so text is wrapped and cut where it'll really end.
const FONT_NAMES: Record<number, string> = { [CELL_FONT]: "Helvetica, Segoe UI Emoji" };
const context = new OffscreenCanvas(1, 1).getContext("2d");

const measure = (text: string, fontSize: number) => {
  if (!context) return text.length * fontSize * 0.55;
  context.font = `${fontSize}px ${FONT_NAMES[CELL_FONT]}`;
  return context.measureText(text).width;
};

self.onmessage = async (e: MessageEvent<{ name: string; data: ArrayBuffer }>) => {
  const { name, data } = e.data;
  let reply: XlsxReply;
  try {
    const read = await readXlsx(name, data);
    const board = typeof read === "string" ? read : workbookBoard(name, read.sheets, read.files, measure);
    reply = typeof board === "string" ? { error: board } : { board: { ...board, notShown: typeof read === "string" ? [] : read.unsupported } };
  } catch {
    reply = { error: `Couldn't read ${name}.` };
  }
  self.postMessage(reply);
};
