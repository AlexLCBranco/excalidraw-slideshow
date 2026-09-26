import { useCallback, useState } from "react";

import { type Board, parseBoard } from "../../domain/scene";
import { saveLastOpened } from "../../lib/storage";
import type { Picked } from "./pickBoard";

export interface LoadedBoard {
  /** The library id, also used in the address bar. */
  id: string;
  board: Board;
  /** Bumped on every load, so reopening the same board starts a fresh slideshow. */
  key: number;
}

let loads = 0;

/** Reads and parses one board at a time. Files are read fresh on every open, so edits show up. */
export function useBoardLoader() {
  const [loaded, setLoaded] = useState<LoadedBoard | null>(null);
  const [loading, setLoading] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  /** The board that last failed to open, so the address bar doesn't retry it in a loop. */
  const [failedId, setFailedId] = useState<string | null>(null);

  const load = useCallback(async (id: string, source: Picked) => {
    setLoading({ id, name: source.name });
    setError("");
    setFailedId(null);
    try {
      const file = source instanceof File ? source : await source.getFile();
      const result = parseBoard(file.name, await file.text());
      if (typeof result === "string") {
        setError(result);
        setFailedId(id);
      } else {
        setLoaded({ id, board: result, key: ++loads });
        saveLastOpened(file.name);
      }
    } catch {
      setError(`Couldn't read ${source.name}. It may have been moved or deleted.`);
      setFailedId(id);
    } finally {
      setLoading(null);
    }
  }, []);

  /** Lets go of the open board, freeing its memory (boards run to tens of MB). */
  const unload = useCallback(() => setLoaded(null), []);

  return { loaded, loading, error, failedId, setError, load, unload };
}
