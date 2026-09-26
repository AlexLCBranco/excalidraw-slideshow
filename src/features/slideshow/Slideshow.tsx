import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { BinaryFiles, ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import { useEffect, useMemo, useState } from "react";

import { DEFAULT_PAGE_HEIGHT, findPages, fitPage, pageAt } from "../../domain/pages";
import type { Board } from "../../domain/scene";
import { loadPageHeight, savePageHeight } from "../../lib/storage";
import styles from "./Slideshow.module.css";
import { useSlideKeys } from "./useSlideKeys";
import { useToast } from "./useToast";
import { useViewportSize } from "./useViewportSize";

interface Props {
  board: Board;
  onOpenAnother: () => void;
  onClose: () => void;
}

/** Excalidraw re-centres the scene just after it mounts; wait this long before taking over the camera. */
const SETTLE_MS = 300;
const RESIZE_STEP = 1.1;

/**
 * Shows one page of a board at a time. Excalidraw runs read-only; this
 * component owns the camera, moving it page to page and covering whatever of
 * the neighbouring pages would still be visible above and below.
 */
export function Slideshow({ board, onOpenAnother, onClose }: Props) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [ready, setReady] = useState(false);
  const [pageHeight, setPageHeight] = useState(() => loadPageHeight(board.name) ?? DEFAULT_PAGE_HEIGHT);
  const pages = useMemo(() => findPages(board.elements, pageHeight), [board.elements, pageHeight]);
  const [index, setIndex] = useState(0);
  const { width, height } = useViewportSize();
  const [toast, showToast] = useToast();

  const page = pages[Math.min(index, pages.length - 1)];
  const view = useMemo(() => fitPage(page, width, height), [page, width, height]);

  useEffect(() => {
    if (!api) return;
    const t = setTimeout(() => setReady(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [api]);

  useEffect(() => {
    if (!api || !ready) return;
    api.updateScene({
      appState: { zoom: { value: view.zoom as NormalizedZoomValue }, scrollX: view.scrollX, scrollY: view.scrollY },
    });
  }, [api, ready, view]);

  const go = (i: number) => setIndex(Math.max(0, Math.min(pages.length - 1, i)));

  const resizePages = (factor: number) => {
    const next = Math.round(pageHeight * factor);
    const nextPages = findPages(board.elements, next);
    if (nextPages.length && nextPages[0].name) {
      showToast("This board uses its frames as pages");
      return;
    }
    setIndex(pageAt(nextPages, (page.y0 + page.y1) / 2));
    setPageHeight(next);
    savePageHeight(board.name, next);
    showToast(`${nextPages.length} pages`);
  };

  useSlideKeys(ready, {
    next: () => go(index + 1),
    previous: () => go(index - 1),
    first: () => go(0),
    last: () => go(pages.length - 1),
    smaller: () => resizePages(1 / RESIZE_STEP),
    bigger: () => resizePages(RESIZE_STEP),
    open: onOpenAnother,
    close: onClose,
  });

  const initialData = useMemo(
    () => ({
      elements: board.elements as never,
      files: board.files as BinaryFiles,
      appState: { viewBackgroundColor: board.background },
    }),
    [board],
  );

  return (
    <div className={styles.stage}>
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initialData}
        theme="dark"
        viewModeEnabled
        zenModeEnabled
        UIOptions={{ canvasActions: { toggleTheme: false } }}
      />
      <div className={styles.mask} style={{ top: 0, height: view.marginY }} />
      <div className={styles.mask} style={{ bottom: 0, height: view.marginY }} />
      {ready ? (
        <div className={styles.hud}>
          {page.name && <span className={styles.pageName}>{page.name}</span>}
          {pages.indexOf(page) + 1} / {pages.length}
        </div>
      ) : (
        <div className={styles.loading}>Loading {board.name}…</div>
      )}
      <div className={styles.toast} data-visible={toast !== null}>
        {toast}
      </div>
    </div>
  );
}
