import { useCallback, useEffect, useState } from "react";

import { type BoardEntry, hasAccess, idWithin, scanSources } from "../../lib/library";
import { loadSources, type Source, saveSources } from "../../lib/storage";

/**
 * "loading": reading what was connected before.
 * "blocked": sources exist, but the browser wants a click before reading them again.
 * "ready": entries are listed (possibly none).
 */
export type LibraryState = "loading" | "blocked" | "ready";

/**
 * The connected folders and files, and every board found in them. The list
 * is refreshed whenever the window comes back into focus, so boards saved
 * from excalidraw.com in the meantime show up.
 */
export function useLibrary() {
  const [sources, setSources] = useState<Source[]>([]);
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [state, setState] = useState<LibraryState>("loading");

  const refresh = useCallback(async (list: Source[], ask = false) => {
    // One at a time: the browser shows one permission prompt per source.
    const allowed: boolean[] = [];
    for (const s of list) allowed.push(await hasAccess(s, ask));
    if (list.length && !allowed.some(Boolean)) {
      setState("blocked");
      return;
    }
    setEntries(await scanSources(list.filter((_, i) => allowed[i])));
    setState("ready");
  }, []);

  useEffect(() => {
    void loadSources().then((list) => {
      setSources(list);
      void refresh(list);
    });
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => state === "ready" && void refresh(sources);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, sources, state]);

  const update = useCallback(
    (next: Source[]) => {
      setSources(next);
      void saveSources(next);
      void refresh(next);
    },
    [refresh],
  );

  /**
   * Adds a folder or file, unless the library already covers it. A new folder
   * replaces anything already connected inside it. Returns the id the source
   * (for a file) is listed under.
   */
  const add = useCallback(
    async (source: Source) => {
      const existing = await idWithin(sources, source);
      if (existing !== null) return existing;
      const inside = await Promise.all(sources.map((s) => idWithin([source], s)));
      update([...sources.filter((_, i) => inside[i] === null), source]);
      return source.name;
    },
    [sources, update],
  );

  const remove = useCallback((source: Source) => update(sources.filter((s) => s !== source)), [sources, update]);

  /** Must run from a click: the browser only shows its permission prompt then. */
  const allowAccess = useCallback(() => refresh(sources, true), [refresh, sources]);

  return { sources, entries, state, add, remove, allowAccess };
}
