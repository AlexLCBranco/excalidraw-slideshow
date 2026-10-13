/**
 * What to do with files dropped on the window (or opened any other way):
 * which ones the app can present, and whether they play alone or as a group.
 */

export type FileKind = "board" | "workbook";

/** Excalidraw boards and Excel workbooks, the files the library lists; null for anything else. */
export function fileKind(name: string): FileKind | null {
  if (/\.excalidraw$/i.test(name)) return "board";
  if (/\.xlsx$/i.test(name)) return "workbook";
  return null;
}

/** "Notes.PDF" -> ".pdf", "README" -> "". */
export const extensionOf = (name: string) => /\.[^./\\]+$/.exec(name)?.[0].toLowerCase() ?? "";

/** Whether a drag carries files (rather than text or a link), from `DataTransfer.types`. */
export const isFileDrag = (types: readonly string[]) => types.includes("Files");

export type DropPlan =
  /** Nothing the app can open; `note` says why ("" when no files were dropped at all). */
  | { open: "nothing"; note: string }
  | { open: "one"; index: number; note: string }
  /** Played back to back, in the order given. */
  | { open: "group"; indices: number[]; note: string };

/**
 * Decides what a drop of `names` (in the order the browser handed them over)
 * opens. One openable file opens on its own. Two or more drawings open as a
 * group, in that order; workbooks have pages of their own, so they never join
 * one. The note lists what was left out, and why.
 */
export function planDrop(names: readonly string[]): DropPlan {
  const kinds = names.map(fileKind);
  const openable = names.map((_, i) => i).filter((i) => kinds[i] !== null);
  const drawings = openable.filter((i) => kinds[i] === "board");
  const unsupported = names.filter((_, i) => kinds[i] === null);
  const notes = unsupported.length ? [cantOpen(unsupported)] : [];

  if (!openable.length) return { open: "nothing", note: notes.join(" · ") };
  if (openable.length === 1) return { open: "one", index: openable[0], note: notes.join(" · ") };

  const chosen = drawings.length > 1 ? drawings : [openable[0]];
  const leftOut = openable.filter((i) => !chosen.includes(i)).map((i) => names[i]);
  if (leftOut.length) notes.push(`Left out ${orList(leftOut)}: workbooks play on their own, not in a group`);
  const note = notes.join(" · ");
  return chosen.length > 1 ? { open: "group", indices: chosen, note } : { open: "one", index: chosen[0], note };
}

/** "Can't open .pdf files", "Can't open .pdf or .docx files", "Can't open README". */
function cantOpen(names: readonly string[]) {
  const extensions = [...new Set(names.map(extensionOf).filter(Boolean))];
  const bare = names.filter((n) => !extensionOf(n));
  const parts = [extensions.length ? `${orList(extensions)} files` : "", bare.length ? orList(bare) : ""];
  return `Can't open ${parts.filter(Boolean).join(" or ")}`;
}

const orList = (items: readonly string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;

/** The name a group of dropped boards plays under: "intro + demo", or "intro + 3 more" for longer lists. */
export function dropGroupName(names: readonly string[]): string {
  const shown = names.map((n) => n.replace(/\.excalidraw$/i, ""));
  return shown.length > 3 ? `${shown[0]} + ${shown.length - 1} more` : shown.join(" + ");
}

/**
 * How many elements a file drag is over. Moving onto a child element fires its
 * "enter" before the parent's "leave", so the count never touches zero inside
 * the window, and the drop overlay doesn't flicker. "over" (repeated while the
 * drag hovers) means it is on the page whatever the count says. A drop, Esc,
 * or the drag going quiet ends it outright.
 */
export type DragSignal = "enter" | "leave" | "over" | "end";

export function nextDragDepth(depth: number, signal: DragSignal): number {
  if (signal === "enter") return depth + 1;
  if (signal === "over") return Math.max(depth, 1);
  if (signal === "leave") return Math.max(0, depth - 1);
  return 0;
}
