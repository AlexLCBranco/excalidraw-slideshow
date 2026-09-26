/**
 * Everything the app remembers between launches, all in this browser:
 *  - the page height chosen and the page last shown per board (localStorage), and
 *  - a handle to the last opened file (IndexedDB, because file handles can't
 *    be turned into text for localStorage).
 * Every call tolerates storage being unavailable and falls back to "nothing saved".
 */

const PREFIX = "excalidraw-slideshow:";

export function loadPageHeight(boardName: string): number | null {
  try {
    const v = Number(localStorage.getItem(PREFIX + "pageHeight:" + boardName));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function savePageHeight(boardName: string, height: number) {
  try {
    localStorage.setItem(PREFIX + "pageHeight:" + boardName, String(height));
  } catch {
    // Not remembered this time; nothing else depends on it.
  }
}

/** The page last shown per board, so reopening a board resumes there. */
export function loadLastPage(boardName: string): number {
  try {
    return Math.max(0, Number(localStorage.getItem(PREFIX + "lastPage:" + boardName)) || 0);
  } catch {
    return 0;
  }
}

export function saveLastPage(boardName: string, index: number) {
  try {
    localStorage.setItem(PREFIX + "lastPage:" + boardName, String(index));
  } catch {
    // Not remembered this time; the board opens on page 1 next time.
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
        tx.oncomplete = () => resolve(req ? req.result : null);
        tx.onerror = () => resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

export const saveLastFile = (handle: FileSystemFileHandle) => withStore("readwrite", (s) => void s.put(handle, "lastFile"));
export const loadLastFile = () => withStore<FileSystemFileHandle>("readonly", (s) => s.get("lastFile"));
