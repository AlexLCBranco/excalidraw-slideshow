/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { Board } from "../domain/scene";
import { indexSheet } from "../domain/sheet";
import { workbookBoard } from "../domain/sheetScene";
import { applyTint, formatDate, formatNumber, type ReadWorkbook, readXlsx } from "./xlsx";

/** A real workbook: 5 sheets, 31 pictures, whole columns painted black, merged cells, formulas. */
const FIXTURE = path.resolve(import.meta.dirname, "../../tests/fixtures/UselessThotsBrRDD21.xlsx");
/** Close enough to Arial for laying out text in a test. */
const measure = (text: string, size: number) => text.length * size * 0.55;

describe("the real workbook", () => {
  let book: ReadWorkbook;
  let board: Board;

  beforeAll(async () => {
    const bytes = readFileSync(FIXTURE);
    const read = await readXlsx("UselessThotsBrRDD21.xlsx", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    if (typeof read === "string") throw new Error(read);
    book = read;
    const made = workbookBoard("UselessThotsBrRDD21.xlsx", book.sheets, book.files, measure);
    if (typeof made === "string") throw new Error(made);
    board = made;
  });

  it("shows every sheet, in Excel's order", () => {
    const names = ["Results", "Rodada", "Power Rankings", "Mais Escalados", "Teams"];
    expect(book.sheets.map((s) => s.name)).toEqual(names);
    expect(board.tabs?.map((t) => t.name)).toEqual(names);
    // Each tab starts on a page of its own sheet, and the pages run through the sheets in order.
    board.tabs?.forEach((t) => expect(board.pages?.[t.firstPage].name).toBe(t.name));
    expect(board.tabs?.map((t) => t.firstPage)).toEqual([...(board.tabs?.map((t) => t.firstPage) ?? [])].sort((a, b) => a - b));
  });

  it("reads every picture", () => {
    const pictures = book.sheets.flatMap((s) => s.pictures);
    expect(pictures).toHaveLength(31);
    for (const p of pictures) expect(book.files[p.fileId]?.dataURL).toMatch(/^data:image\/(png|jpeg);base64,/);
  });

  it("places every picture on exactly one page, uncut", () => {
    const images = board.elements.filter((e) => e.type === "image");
    expect(images).toHaveLength(31);
    for (const img of images) {
      const within = (board.pages ?? []).filter(
        (p) => img.x >= p.x0 - 0.5 && img.y >= p.y0 - 0.5 && img.x + (img.width ?? 0) <= p.x1 + 0.5 && img.y + (img.height ?? 0) <= p.y1 + 0.5,
      );
      expect(within, `picture ${img.id}`).toHaveLength(1);
      expect(img.width).toBeGreaterThan(0);
      expect(img.height).toBeGreaterThan(0);
    }
  });

  it("paints empty cells of a column-painted sheet black", () => {
    const results = indexSheet(book.sheets[0]);
    expect(book.sheets[0].cells).toHaveLength(0);
    expect(results.style(10, 10).fill).toBe("#000000");
    // On screen: the whole Results page is covered by black.
    const page = board.pages![0];
    const black = board.elements.filter(
      (e) => e.type === "rectangle" && (e as { backgroundColor?: string }).backgroundColor === "#000000",
    );
    expect(black.some((e) => e.x <= page.x0 && e.y <= page.y0 && e.x + (e.width ?? 0) >= page.x1 && e.y + (e.height ?? 0) >= page.y1)).toBe(true);
  });

  it("reads merged cells and shows formulas' saved results", () => {
    const pr = book.sheets[2];
    expect(pr.merges).toHaveLength(6);
    expect(pr.cells.find((c) => c.row === 0 && c.col === 30)?.text).toBe("TEC"); // AE1 = I12
  });

  it("reads the 12 notes on Power Rankings and puts each on a page", () => {
    const notes = book.sheets[2].notes;
    expect(notes).toHaveLength(12);
    expect(notes.find((n) => n.row === 16 && n.col === 5)?.text).toBe("Alex Castelo Branco:\nhes getting sparred theres no way"); // F17
    expect(board.notes).toHaveLength(12);
    for (const n of board.notes ?? []) {
      expect((board.pages ?? []).filter((p) => n.x0 >= p.x0 && n.x1 <= p.x1 && n.y0 >= p.y0 && n.y1 <= p.y1)).toHaveLength(1);
    }
  });

  it("draws white text on black, as in Excel", () => {
    const texts = board.elements.filter((e) => e.type === "text");
    expect(texts.length).toBeGreaterThan(50);
    expect(texts.some((t) => (t as { strokeColor?: string }).strokeColor === "#ffffff")).toBe(true);
  });
});

describe("formatNumber", () => {
  it("shows common formats", () => {
    expect(formatNumber(1234.5)).toBe("1234.5");
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(1234.567, "#,##0.00")).toBe("1,234.57");
    expect(formatNumber(0.256, "0%")).toBe("26%");
    expect(formatNumber(-3, "0.0")).toBe("-3.0");
    expect(formatNumber(45000, "dd/mm/yyyy")).toBe("15/03/2023");
  });

  it("shows dates and times", () => {
    expect(formatDate(new Date(Date.UTC(2024, 0, 5, 9, 7)), "d/m/yy h:mm")).toBe("5/1/24 9:07");
  });
});

describe("applyTint", () => {
  it("darkens and lightens like Excel", () => {
    expect(applyTint("FFFFFF", -0.5)).toBe("808080");
    expect(applyTint("000000", 0.5)).toBe("808080");
  });
});
