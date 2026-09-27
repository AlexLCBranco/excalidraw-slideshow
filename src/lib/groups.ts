import type { BoardEntry } from "./library";
import type { SavedGroup } from "./storage";

/** Boards presented back to back, as if they were one long board. */
export interface Group {
  /** Used in the address bar, like a board's id: the folder's path, or "~…" for a group made by hand. */
  id: string;
  name: string;
  /** The boards found, in the order they're presented. */
  entries: BoardEntry[];
  /** A group made by hand in the library (editable), rather than a folder. */
  picked: boolean;
  /** Boards of a hand-made group that are no longer in the library. */
  missing: number;
}

const byName = (a: BoardEntry, b: BoardEntry) => a.name.localeCompare(b.name, undefined, { numeric: true });

/**
 * Every folder inside a connected folder that holds two or more boards is a
 * group, played in name order (so "01 intro", "02 …" sets the order). The
 * connected folders themselves aren't: they're collections, not talks.
 */
export function folderGroups(entries: readonly BoardEntry[]): Group[] {
  const byFolder = new Map<string, BoardEntry[]>();
  for (const e of entries) {
    if (!e.folder.includes("/")) continue;
    byFolder.set(e.folder, [...(byFolder.get(e.folder) ?? []), e]);
  }
  return [...byFolder]
    .filter(([, list]) => list.length > 1)
    .map(([folder, list]) => ({
      id: folder,
      name: folder.split("/").pop() ?? folder,
      entries: list.sort(byName),
      picked: false,
      missing: 0,
    }));
}

/** Hand-made groups, matched to the boards currently in the library. */
export function pickedGroups(saved: readonly SavedGroup[], entries: readonly BoardEntry[]): Group[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return saved.map((g) => {
    const found = g.boardIds.map((id) => byId.get(id)).filter((e) => e !== undefined);
    return { id: g.id, name: g.name, entries: found, picked: true, missing: g.boardIds.length - found.length };
  });
}

export const newGroupId = () => "~" + Date.now().toString(36);
