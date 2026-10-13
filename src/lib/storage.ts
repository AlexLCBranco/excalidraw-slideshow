/**
 * Everything the app remembers between visits, all in this browser:
 *  - per board, the page height chosen, page cuts saved by hand, the page last shown and when it was
 *    last opened, and the groups put together by hand (localStorage), and
 *  - the connected folders and files, cached board thumbnails, and text and pictures added to boards
 *    (IndexedDB, because file handles and images can't go in localStorage).
 * Every call tolerates storage being unavailable and falls back to "nothing saved".
 */

import { type Addition, validAdditions } from "../domain/additions";

const PREFIX = "excalidraw-slideshow:";

function loadNumber(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(PREFIX + key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function saveNumber(key: string, value: number) {
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch {
    // Not remembered this time; nothing else depends on it.
  }
}

export const loadPageHeight = (board: string) => loadNumber("pageHeight:" + board);
export const savePageHeight = (board: string, height: number) => saveNumber("pageHeight:" + board, height);

/** Page cuts moved by hand and saved (scene heights), or null for the automatic ones. */
export function loadCuts(board: string): number[] | null {
  try {
    const cuts: unknown = JSON.parse(localStorage.getItem(PREFIX + "cuts:" + board) ?? "null");
    return Array.isArray(cuts) && cuts.every(Number.isFinite) ? (cuts as number[]) : null;
  } catch {
    return null;
  }
}

/** Saves cuts made by hand; null goes back to the automatic ones. */
export function saveCuts(board: string, cuts: readonly number[] | null) {
  try {
    if (cuts) localStorage.setItem(PREFIX + "cuts:" + board, JSON.stringify(cuts));
    else localStorage.removeItem(PREFIX + "cuts:" + board);
  } catch {
    // Not remembered this time; the cuts last until the board is closed.
  }
}

/** The page last shown (0-based), so reopening a board resumes there. */
export const loadLastPage = (board: string) => loadNumber("lastPage:" + board) ?? 0;
export const saveLastPage = (board: string, index: number) => saveNumber("lastPage:" + board, index);

/** When a board was last opened (ms since 1970), for the "Recently opened" sort. */
export const loadLastOpened = (board: string) => loadNumber("opened:" + board) ?? 0;
export const saveLastOpened = (board: string) => saveNumber("opened:" + board, Date.now());

/** Whether the slideshow's control bar stays on screen (the default) or hides until the mouse moves. */
export function loadBarPinned() {
  try {
    return localStorage.getItem(PREFIX + "barPinned") !== "false";
  } catch {
    return true;
  }
}

export function saveBarPinned(pinned: boolean) {
  try {
    localStorage.setItem(PREFIX + "barPinned", String(pinned));
  } catch {
    // Not remembered this time; the bar shows by default.
  }
}

/** What dragging on a slide does: select elements (the default) or move around a zoomed page. */
export type MouseMode = "select" | "hand";

export function loadMouseMode(): MouseMode {
  try {
    return localStorage.getItem(PREFIX + "mouseMode") === "hand" ? "hand" : "select";
  } catch {
    return "select";
  }
}

export function saveMouseMode(mode: MouseMode) {
  try {
    localStorage.setItem(PREFIX + "mouseMode", mode);
  } catch {
    // Not remembered this time; select is the default.
  }
}

/** A group of boards put together by hand in the library, presented back to back. */
export interface SavedGroup {
  id: string;
  name: string;
  /** Library ids, in the order they're presented. */
  boardIds: string[];
}

export function loadGroups(): SavedGroup[] {
  try {
    const groups: unknown = JSON.parse(localStorage.getItem(PREFIX + "groups") ?? "[]");
    return Array.isArray(groups) ? (groups as SavedGroup[]) : [];
  } catch {
    return [];
  }
}

export function saveGroups(groups: readonly SavedGroup[]) {
  try {
    localStorage.setItem(PREFIX + "groups", JSON.stringify(groups));
  } catch {
    // Not remembered this time; the groups last only until the page closes.
  }
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void) {
  return new Promise<T | null>((resolve) => {
    try {
      const open = indexedDB.open("excalidraw-slideshow", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const tx = open.result.transaction("kv", mode);
        const req = run(tx.objectStore("kv"));
        tx.oncomplete = () => resolve(req ? (req.result ?? null) : null);
        tx.onerror = () => resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

/** A connected folder, or a single board file opened on its own. */
export type Source = FileSystemDirectoryHandle | FileSystemFileHandle;

export async function loadSources(): Promise<Source[]> {
  const sources = await withStore<Source[]>("readonly", (s) => s.get("sources"));
  if (sources) return sources;
  // v0.0.2 and earlier remembered just the last opened file.
  const lastFile = await withStore<FileSystemFileHandle>("readonly", (s) => s.get("lastFile"));
  return lastFile ? [lastFile] : [];
}

export const saveSources = (sources: Source[]) => withStore("readwrite", (s) => void s.put(sources, "sources"));

/** A board's first page as an image, tagged with what it was drawn from. */
export interface CachedThumbnail {
  /** Changes whenever the file or its page height does, which makes the image stale. */
  stamp: string;
  image: Blob;
  pageCount: number;
}

export const loadThumbnail = (id: string) => withStore<CachedThumbnail>("readonly", (s) => s.get("thumb:" + id));
export const saveThumbnail = (id: string, thumb: CachedThumbnail) =>
  withStore("readwrite", (s) => void s.put(thumb, "thumb:" + id));

/** Text and pictures added to a board and saved (IndexedDB: pictures are too big for localStorage). */
export const loadAdditions = async (board: string) =>
  validAdditions(await withStore<unknown>("readonly", (s) => s.get("added:" + board)));

/** Saves a board's additions (an empty list forgets them). Resolves to whether they were stored. */
export const saveAdditions = async (board: string, additions: readonly Addition[]) =>
  (await withStore<IDBValidKey>("readwrite", (s) => s.put(additions, "added:" + board))) !== null;
