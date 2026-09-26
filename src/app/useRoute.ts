import { useCallback, useEffect, useState } from "react";

/**
 * The address bar is the app's state:
 *   /                          the library
 *   /view/<board id>#<page>    a board, on that page (1-based)
 * so Back, Refresh and bookmarks all work.
 */
export interface Route {
  boardId: string | null;
  /** 0-based page from the address, if it has one. */
  page: number | null;
}

const VIEW = "/view/";

function read(): Route {
  const path = location.pathname;
  const page = Number(location.hash.slice(1));
  return {
    boardId: path.startsWith(VIEW) ? path.slice(VIEW.length).split("/").map(decodeURIComponent).join("/") : null,
    page: Number.isInteger(page) && page > 0 ? page - 1 : null,
  };
}

const pathFor = (boardId: string | null) =>
  boardId === null ? "/" : VIEW + boardId.split("/").map(encodeURIComponent).join("/");

export function useRoute() {
  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onPop = () => setRoute(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** Opens a board. Back returns to where this was called from. */
  const openBoard = useCallback((boardId: string) => {
    history.pushState({ fromApp: true }, "", pathFor(boardId));
    setRoute(read());
  }, []);

  /** Back to the library: a real Back when the board was opened from it, so history doesn't pile up. */
  const toLibrary = useCallback(() => {
    if ((history.state as { fromApp?: boolean } | null)?.fromApp) history.back();
    else {
      history.replaceState(null, "", "/");
      setRoute(read());
    }
  }, []);

  return { route, openBoard, toLibrary };
}

/** Keeps the page number in the address bar without adding history entries. */
export function showPageInAddress(page: number) {
  history.replaceState(history.state, "", `#${page + 1}`);
}
