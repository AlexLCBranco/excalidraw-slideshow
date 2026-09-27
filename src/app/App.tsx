import { useCallback, useEffect } from "react";

import { displayName } from "../features/library/format";
import { LibraryScreen } from "../features/library/LibraryScreen";
import { useLibrary } from "../features/library/useLibrary";
import { type Picked, pickBoardFile, pickBoardFolder } from "../features/open/pickBoard";
import { useBoardLoader } from "../features/open/useBoardLoader";
import { useLaunchFiles } from "../features/open/useLaunchFiles";
import { useWindowFileDrop } from "../features/open/useWindowFileDrop";
import { Slideshow } from "../features/slideshow/Slideshow";
import styles from "./App.module.css";
import { useAutoUpdate } from "./useAutoUpdate";
import { showPageInAddress, useRoute } from "./useRoute";
import { VersionBadge } from "./VersionBadge";

const TITLE = "Excalidraw Slideshow";

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
    if (entry) void load(id, entry.handle);
    else if (library.state === "ready") {
      setError(`Couldn't find “${id}”. Was it moved or renamed?`);
      toLibrary();
    }
  }, [route.boardId, loaded, loading, failedId, library.entries, library.state, load, unload, setError, toLibrary]);

  const showing = loaded && loaded.id === route.boardId ? loaded : null;
  useAutoUpdate(route.boardId === null);

  useEffect(() => {
    document.title = showing ? `${displayName(showing.board.name)} · ${TITLE}` : TITLE;
  }, [showing]);

  const present = useCallback(
    (id: string, source: Picked) => {
      void load(id, source);
      openBoard(id);
    },
    [load, openBoard],
  );

  /** A file chosen in the picker or dropped on the window: remember it (when possible) and present it. */
  const openPicked = useCallback(
    (picked: Picked) => {
      if (picked instanceof File) present(picked.name, picked);
      else void library.add(picked).then((id) => present(id, picked));
    },
    [library, present],
  );

  const openFile = useCallback(() => void pickBoardFile().then((p) => p && openPicked(p)), [openPicked]);
  const connectFolder = useCallback(() => void pickBoardFolder().then((d) => d && library.add(d)), [library]);
  const dragging = useWindowFileDrop(openPicked);
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
            notice={error}
            onDismissNotice={() => setError("")}
            dragging={dragging}
            onOpen={(entry) => present(entry.id, entry.handle)}
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
    </>
  );
}
