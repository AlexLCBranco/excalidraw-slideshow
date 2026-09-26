import { DEFAULT_PAGE_HEIGHT, findPages } from "../domain/pages";
import { parseBoard } from "../domain/scene";
import { renderPage } from "./render";
import { type CachedThumbnail, loadPageHeight, loadThumbnail, type Source, saveThumbnail } from "./storage";

// Parts of the File System Access API (Edge and Chrome) missing from TypeScript's DOM types.
declare global {
  interface Window {
    showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>;
    showDirectoryPicker?: (options?: object) => Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission?: (options?: object) => Promise<PermissionState>;
    requestPermission?: (options?: object) => Promise<PermissionState>;
  }
  interface DataTransferItem {
    getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
  }
}

/** One board file found in a source. */
export interface BoardEntry {
  /** Stable across visits: the source's name plus the path inside it. Used in the address bar. */
  id: string;
  name: string;
  /** The folder it was found in, as a path from the connected folder, or "" for a file opened on its own. */
  folder: string;
  handle: FileSystemFileHandle;
  size: number;
  lastModified: number;
}

const BOARD_FILE = /\.excalidraw$/i;
/** Obsidian vaults hold deep trees of notes; boards live near the top. */
const MAX_DEPTH = 4;
const READ = { mode: "read" } as const;
/** Longest side of a board card picture, in px. */
const THUMB_SIZE = 640;

export const canConnectFolders = () => typeof window.showDirectoryPicker === "function";

/** Whether the browser still lets this page read `source`. With `ask`, shows the browser's prompt. */
export async function hasAccess(source: Source, ask = false) {
  if ((await source.queryPermission?.(READ)) === "granted") return true;
  return ask && (await source.requestPermission?.(READ)) === "granted";
}

/** Every board in the given sources. Sources that can't be read are skipped. */
export async function scanSources(sources: readonly Source[]): Promise<BoardEntry[]> {
  const found = await Promise.all(
    sources.map(async (source) => {
      const entries: BoardEntry[] = [];
      try {
        if (source.kind === "file") entries.push(await entryFor(source, source.name, ""));
        else await walk(source, source.name, 0, entries);
      } catch {
        // Moved, deleted or no longer allowed: show what the other sources have.
      }
      return entries;
    }),
  );
  // Two sources with the same name and path would clash in the address bar; keep one.
  const byId = new Map(found.flat().map((e) => [e.id, e]));
  return [...byId.values()];
}

async function walk(dir: FileSystemDirectoryHandle, path: string, depth: number, out: BoardEntry[]) {
  for await (const child of dir.values()) {
    if (child.name.startsWith(".")) continue;
    const childPath = `${path}/${child.name}`;
    if (child.kind === "file" && BOARD_FILE.test(child.name)) {
      out.push(await entryFor(child as FileSystemFileHandle, childPath, path));
    } else if (child.kind === "directory" && depth < MAX_DEPTH) {
      await walk(child as FileSystemDirectoryHandle, childPath, depth + 1, out);
    }
  }
}

/**
 * The library id of `handle` if one of `sources` already covers it: it is
 * that file, or it sits inside that folder. Null otherwise.
 */
export async function idWithin(sources: readonly Source[], handle: FileSystemHandle): Promise<string | null> {
  for (const s of sources) {
    if (await s.isSameEntry(handle)) return s.name;
    if (s.kind === "directory") {
      const path = await s.resolve(handle);
      if (path) return [s.name, ...path].join("/");
    }
  }
  return null;
}

async function entryFor(handle: FileSystemFileHandle, id: string, folder: string): Promise<BoardEntry> {
  const file = await handle.getFile();
  return { id, name: handle.name, folder, handle, size: file.size, lastModified: file.lastModified };
}

// Thumbnails are made one board at a time: each means parsing up to ~35 MB.
let queue: Promise<unknown> = Promise.resolve();

/**
 * A board's first page as an image, plus its page count. Served from the
 * cache while the file is unchanged; otherwise the board is read and drawn.
 */
export function boardThumbnail(entry: BoardEntry): Promise<CachedThumbnail | null> {
  const pageHeight = loadPageHeight(entry.name) ?? DEFAULT_PAGE_HEIGHT;
  const stamp = `${entry.lastModified}:${entry.size}:${pageHeight}`;
  const job = queue.then(async () => {
    const cached = await loadThumbnail(entry.id);
    if (cached?.stamp === stamp) return cached;
    const board = parseBoard(entry.name, await (await entry.handle.getFile()).text());
    if (typeof board === "string") return null;
    const pages = findPages(board.elements, pageHeight);
    const image = await renderPage(board, pages[0], THUMB_SIZE);
    if (!image) return null;
    const thumb = { stamp, image, pageCount: pages.length };
    void saveThumbnail(entry.id, thumb);
    return thumb;
  });
  queue = job.catch(() => null);
  return job.catch(() => null);
}
