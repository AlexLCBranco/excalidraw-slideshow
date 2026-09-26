/**
 * Everything the app remembers between launches, all in this browser:
 *  - the page height chosen per board (localStorage), and
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
