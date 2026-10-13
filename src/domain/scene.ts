import type { BoardNote } from "./notes";
import type { SheetTab } from "./sheetPages";
import type { Page, SceneElement } from "./types";

/** A board file, parsed. `files` holds embedded images; the app passes it through untouched. */
export interface Board {
  name: string;
  elements: SceneElement[];
  files: Record<string, unknown>;
  background: string;
  /**
   * Set when several boards are presented as one (domain/group.ts): each
   * board's elements, already moved into place, so pages are found per board.
   */
  parts?: readonly BoardPart[];
  /** Pages fixed when the file was read (spreadsheets, domain/sheetScene.ts) instead of found from the drawing. */
  pages?: readonly Page[];
  /** A spreadsheet's sheets, in the order of its tabs. */
  tabs?: readonly SheetTab[];
  /**
   * Drawn in the file's own colours. Excalidraw's dark theme inverts every
   * colour, which suits drawings but would turn a black sheet white.
   */
  exactColors?: boolean;
  /** A spreadsheet's cell notes, shown when the mouse is over their cell. */
  notes?: readonly BoardNote[];
  /** What the file holds that is drawn differently from Excel, or not at all, said once on opening. */
  notShown?: readonly string[];
}

export interface BoardPart {
  /** The board's name without ".excalidraw", shown on its automatically found pages. */
  name: string;
  elements: readonly SceneElement[];
}

/** Parses the text of a .excalidraw file. Returns an error message for anything else. */
export function parseBoard(name: string, text: string): Board | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return `${name} isn't an Excalidraw board.`;
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as { elements?: unknown }).elements)) {
    return `${name} isn't an Excalidraw board.`;
  }
  const scene = data as { elements: SceneElement[]; files?: Record<string, unknown>; appState?: { viewBackgroundColor?: string } };
  if (!scene.elements.some((e) => !e.isDeleted)) return `${name} is empty.`;
  return {
    name,
    elements: scene.elements,
    files: scene.files ?? {},
    background: scene.appState?.viewBackgroundColor ?? "#ffffff",
  };
}
