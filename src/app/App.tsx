import { useCallback, useEffect } from "react";

import { dropGroupName, planDrop } from "../domain/drop";
import { displayName } from "../features/library/format";
import { LibraryScreen } from "../features/library/LibraryScreen";
import { useLibrary } from "../features/library/useLibrary";
import { DropOverlay } from "../features/open/DropOverlay";
import { type Picked, pickBoardFile, pickBoardFolder } from "../features/open/pickBoard";
import { useBoardLoader } from "../features/open/useBoardLoader";
import { useLaunchFiles } from "../features/open/useLaunchFiles";
import { useWindowFileDrop } from "../features/open/useWindowFileDrop";
import { Slideshow } from "../features/slideshow/Slideshow";
import { useToast } from "../features/slideshow/useToast";
import { newGroupId } from "../lib/groups";
import styles from "./App.module.css";
import { useAutoUpdate } from "./useAutoUpdate";
import { showPageInAddress, useRoute } from "./useRoute";
import { VersionBadge } from "./VersionBadge";

const TITLE = "Excalidraw Slideshow";
/** How long a note about a drop stays up. */
const DROP_NOTE_MS = 5000;
const SESSION_ONLY = "Opened for now only: this browser can't add dropped files to the library";

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** Two screens, chosen by the address bar: the library, and a board being presented. */
export function App() {
  const { route, openBoard, toLibrary } = useRoute();
  const library = useLibrary();
  const { loaded, loading, error, failedId, setError, load, unload } = useBoardLoader();

  // Follow the address bar (Back, Forward, Refresh, bookmarks): load the board
  // it names, or let go of the open one.
  useEffect(() => {
    const id = route.boardId;
    if (id === null) {
      unload();
      return;
    }
    if (loaded?.id === id || loading?.id === id) return;
    if (failedId === id) {
      toLibrary();
      return;
    }
    const entry = library.entries.find((e) => e.id === id);
    const group = library.groups.find((g) => g.id === id);
    if (entry) void load(id, entry.name, [entry.handle]);
    else if (group) void load(id, group.name, group.entries.map((e) => e.handle));
    else if (library.state === "ready") {
      setError(`Couldn't find “${id}”. Was it moved or renamed?`);
      toLibrary();
    }
  }, [route.boardId, loaded, loading, failedId, library.entries, library.groups, library.state, load, unload, setError, toLibrary]);

  const showing = loaded && loaded.id === route.boardId ? loaded : null;
  useAutoUpdate(route.boardId === null);

  useEffect(() => {
    document.title = showing ? `${displayName(showing.board.name)} · ${TITLE}` : TITLE;
  }, [showing]);

  const present = useCallback(
    (id: string, name: string, sources: readonly Picked[]) => {
      void load(id, name, sources);
      openBoard(id);
    },
    [load, openBoard],
  );

  /** A file chosen in the picker, dropped or opened from Explorer: remember it (when possible) and present it. */
  const openPicked = useCallback(
    (picked: Picked) => {
      if (picked instanceof File) present(picked.name, picked.name, [picked]);
      else void library.add(picked).then((id) => present(id, picked.name, [picked]));
    },
    [library, present],
  );

  const openFile = useCallback(() => void pickBoardFile().then((p) => p && openPicked(p)), [openPicked]);
  const connectFolder = useCallback(() => void pickBoardFolder().then((d) => d && library.add(d)), [library]);

  const [dropNote, showDropNote] = useToast();
  /**
   * Files dropped on the window. One opens as if picked; several boards open
   * as a group, in the order dropped, saved with the library's hand-made
   * groups so it can be reopened (unless the browser gave no file handles).
   */
  const openDropped = useCallback(
    async (dropped: readonly Picked[]) => {
      const plan = planDrop(dropped.map((d) => d.name));
      const chosen = plan.open === "one" ? [dropped[plan.index]] : plan.open === "group" ? plan.indices.map((i) => dropped[i]) : [];
      const handles = chosen.filter((p): p is FileSystemFileHandle => !(p instanceof File));
      const note = [plan.note, handles.length < chosen.length ? SESSION_ONLY : ""].filter(Boolean).join(" · ");
      if (note) showDropNote(note, DROP_NOTE_MS);
      if (chosen.length === 1) return openPicked(chosen[0]);
      if (chosen.length === 0) return;

      const name = dropGroupName(chosen.map((p) => p.name));
      if (handles.length < chosen.length) return present(newGroupId(), name, chosen);
      // One at a time: each addition builds on the library the one before left.
      const ids: string[] = [];
      for (const handle of handles) ids.push(await library.add(handle));
      const same = library.groups.find((g) => g.picked && !g.missing && sameIds(g.entries.map((e) => e.id), ids));
      const group = same ? { id: same.id, name: same.name } : { id: newGroupId(), name };
      if (!same) library.saveGroup({ ...group, boardIds: ids });
      present(group.id, group.name, chosen);
    },
    [library, openPicked, present, showDropNote],
  );
  const dragging = useWindowFileDrop(openDropped);
  useLaunchFiles(openPicked);

  const opening = loading?.name ?? (library.state !== "blocked" ? route.boardId?.split("/").pop() : undefined);

  return (
    <>
      {showing ? (
        <Slideshow
          key={showing.key}
          board={showing.board}
          initialPage={route.page}
          onPageChange={showPageInAddress}
          onOpenAnother={openFile}
          onClose={toLibrary}
        />
      ) : (
        <>
          <LibraryScreen
            state={library.state}
            sources={library.sources}
            entries={library.entries}
            groups={library.groups}
            notice={error}
            onDismissNotice={() => setError("")}
            onOpen={(entry) => present(entry.id, entry.name, [entry.handle])}
            onOpenGroup={(group) => present(group.id, group.name, group.entries.map((e) => e.handle))}
            onSaveGroup={library.saveGroup}
            onRemoveGroup={library.removeGroup}
            onOpenFile={openFile}
            onConnectFolder={connectFolder}
            onRemoveSource={library.remove}
            onAllowAccess={library.allowAccess}
          />
          {opening && (
            <div className={styles.loading}>
              <span className={styles.spinner} />
              Opening {displayName(opening)}…
            </div>
          )}
          <VersionBadge />
        </>
      )}
      <DropOverlay dragging={dragging} note={dropNote} />
    </>
  );
}
