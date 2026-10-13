import { useCallback, useState } from "react";

import { stackBoards } from "../../domain/group";
import type { Board } from "../../domain/scene";
import { isSpreadsheet, readBoardFile } from "../../lib/boardFile";
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

/** Reads and parses one board (or group) at a time. Files are read fresh on every open, so edits show up. */
export function useBoardLoader() {
  const [loaded, setLoaded] = useState<LoadedBoard | null>(null);
  const [loading, setLoading] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  /** The board that last failed to open, so the address bar doesn't retry it in a loop. */
  const [failedId, setFailedId] = useState<string | null>(null);

  /**
   * Opens one board, or several as one group (`name` is then the group's).
   * In a group, boards that can't be read are left out; it fails only if none can.
   */
  const load = useCallback(async (id: string, name: string, sources: readonly Picked[]) => {
    setLoading({ id, name });
    setError("");
    setFailedId(null);
    const boards: Board[] = [];
    let problem = "";
    for (const source of sources) {
      try {
        const file = source instanceof File ? source : await source.getFile();
        // A group plays drawings back to back; a workbook has pages of its own.
        if (sources.length > 1 && isSpreadsheet(file.name)) continue;
        const result = await readBoardFile(file);
        if (typeof result === "string") problem ||= result;
        else boards.push(result);
      } catch {
        problem ||= `Couldn't read ${source.name}. It may have been moved or deleted.`;
      }
    }
    if (boards.length) {
      setLoaded({ id, board: sources.length > 1 ? stackBoards(name, boards) : boards[0], key: ++loads });
      saveLastOpened(name);
    } else {
      setError(problem || `“${name}” has no boards.`);
      setFailedId(id);
    }
    setLoading(null);
  }, []);

  /** Lets go of the open board, freeing its memory (boards run to tens of MB). */
  const unload = useCallback(() => setLoaded(null), []);

  return { loaded, loading, error, failedId, setError, load, unload };
}
