import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { folderGroups, pickedGroups } from "../../lib/groups";
import { type BoardEntry, hasAccess, idWithin, scanSources } from "../../lib/library";
import { loadGroups, loadSources, type SavedGroup, type Source, saveGroups, saveSources } from "../../lib/storage";

/**
 * "loading": reading what was connected before.
 * "blocked": sources exist, but the browser wants a click before reading them again.
 * "ready": entries are listed (possibly none).
 */
export type LibraryState = "loading" | "blocked" | "ready";

/**
 * The connected folders and files, every board found in them, and the groups
 * of boards (see lib/groups.ts). The list is refreshed whenever the window
 * comes back into focus, so boards saved from excalidraw.com in the meantime
 * show up.
 */
export function useLibrary() {
  const [sources, setSources] = useState<Source[]>([]);
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [state, setState] = useState<LibraryState>("loading");
  const [saved, setSaved] = useState(loadGroups);
  const groups = useMemo(() => [...pickedGroups(saved, entries), ...folderGroups(entries)], [saved, entries]);
  // The latest list, as a promise: `add` can be called (say, for a file opened
  // from Explorer) before the saved list has loaded, and must not overwrite it.
  const latest = useRef<Promise<Source[]> | null>(null);
  latest.current ??= loadSources();

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
    void latest.current?.then((list) => {
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
      latest.current = Promise.resolve(next);
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
      const current = (await latest.current) ?? [];
      const existing = await idWithin(current, source);
      if (existing !== null) return existing;
      const inside = await Promise.all(current.map((s) => idWithin([source], s)));
      update([...current.filter((_, i) => inside[i] === null), source]);
      return source.name;
    },
    [update],
  );

  const remove = useCallback((source: Source) => update(sources.filter((s) => s !== source)), [sources, update]);

  /** Must run from a click: the browser only shows its permission prompt then. */
  const allowAccess = useCallback(() => refresh(sources, true), [refresh, sources]);

  const changeGroups = useCallback((change: (list: SavedGroup[]) => SavedGroup[]) => {
    setSaved((list) => {
      const next = change(list);
      saveGroups(next);
      return next;
    });
  }, []);

  /** Adds a hand-made group, or replaces the one with the same id. */
  const saveGroup = useCallback(
    (group: SavedGroup) =>
      changeGroups((list) =>
        list.some((g) => g.id === group.id) ? list.map((g) => (g.id === group.id ? group : g)) : [group, ...list],
      ),
    [changeGroups],
  );

  const removeGroup = useCallback((id: string) => changeGroups((list) => list.filter((g) => g.id !== id)), [changeGroups]);

  return { sources, entries, groups, state, add, remove, allowAccess, saveGroup, removeGroup };
}
