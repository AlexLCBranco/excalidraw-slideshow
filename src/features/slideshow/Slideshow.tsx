import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { BinaryFiles, ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import { useEffect, useMemo, useState } from "react";

import { DEFAULT_PAGE_HEIGHT, findPages, fitPage, pageAt } from "../../domain/pages";
import type { Board } from "../../domain/scene";
import { loadLastPage, loadPageHeight, saveLastPage, savePageHeight } from "../../lib/storage";
import { ControlBar } from "./ControlBar";
import { HelpOverlay } from "./HelpOverlay";
import { LaserPointer } from "./LaserPointer";
import { PageGrid } from "./PageGrid";
import styles from "./Slideshow.module.css";
import { useFullscreen } from "./useFullscreen";
import { usePageThumbnails } from "./usePageThumbnails";
import { usePointerActivity } from "./usePointerActivity";
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
/** A typed page number is forgotten after this long without Enter. */
const TYPED_PAGE_MS = 3000;

type Overlay = "none" | "grid" | "help";

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
  const [resumedAt] = useState(() => Math.min(loadLastPage(board.name), pages.length - 1));
  const [index, setIndex] = useState(resumedAt);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [laser, setLaser] = useState(false);
  const [typed, setTyped] = useState("");
  const [barHovered, setBarHovered] = useState(false);
  const { width, height } = useViewportSize();
  const [toast, showToast] = useToast();
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const pointer = usePointerActivity();
  const thumbnails = usePageThumbnails(board, pages, overlay === "grid");

  const current = Math.min(index, pages.length - 1);
  const page = pages[current];
  const view = useMemo(() => fitPage(page, width, height), [page, width, height]);

  useEffect(() => {
    if (!api) return;
    const t = setTimeout(() => setReady(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [api]);

  // In view mode Excalidraw pans on every drag, so the page is re-fitted whenever the mouse is released.
  const [releases, setReleases] = useState(0);
  useEffect(() => {
    const onRelease = () => setReleases((n) => n + 1);
    window.addEventListener("pointerup", onRelease);
    return () => window.removeEventListener("pointerup", onRelease);
  }, []);

  useEffect(() => {
    if (!api || !ready) return;
    api.updateScene({
      appState: { zoom: { value: view.zoom as NormalizedZoomValue }, scrollX: view.scrollX, scrollY: view.scrollY },
    });
  }, [api, ready, view, releases]);

  useEffect(() => saveLastPage(board.name, current), [board.name, current]);

  useEffect(() => {
    if (ready && resumedAt > 0) showToast(`Resumed at page ${resumedAt + 1} · Home for page 1`);
  }, [ready, resumedAt, showToast]);

  useEffect(() => {
    if (!typed) return;
    const t = setTimeout(() => setTyped(""), TYPED_PAGE_MS);
    return () => clearTimeout(t);
  }, [typed]);

  const go = (i: number) => setIndex(Math.max(0, Math.min(pages.length - 1, i)));
  const toggleOverlay = (o: Overlay) => setOverlay((cur) => (cur === o ? "none" : o));

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
    next: () => go(current + 1),
    previous: () => go(current - 1),
    first: () => go(0),
    last: () => go(pages.length - 1),
    smaller: () => resizePages(1 / RESIZE_STEP),
    bigger: () => resizePages(RESIZE_STEP),
    grid: () => toggleOverlay("grid"),
    help: () => toggleOverlay("help"),
    fullscreen: toggleFullscreen,
    laser: () => setLaser((on) => !on),
    open: onOpenAnother,
    digit: (d) => setTyped((t) => (t + d).slice(-4)),
    enter: () => {
      if (typed) go(Number(typed) - 1);
      setTyped("");
      setOverlay("none");
    },
    // Esc backs out one step at a time: typed number, overlay, laser, then the board.
    close: () => {
      if (typed) setTyped("");
      else if (overlay !== "none") setOverlay("none");
      else if (laser) setLaser(false);
      else onClose();
    },
  });

  const initialData = useMemo(
    () => ({
      elements: board.elements as never,
      files: board.files as BinaryFiles,
      appState: { viewBackgroundColor: board.background },
    }),
    [board],
  );

  // With the laser on, the mouse is busy pointing: only show the bar when it heads for the bottom edge.
  const barVisible =
    ready && (overlay !== "none" || barHovered || (pointer.moving && (!laser || pointer.nearBottom)));

  return (
    <div className={styles.stage} data-cursor-hidden={ready && !pointer.moving && !laser}>
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

      {laser && <LaserPointer />}
      {!ready && <div className={styles.loading}>Loading {board.name}…</div>}

      {ready && (
        <>
          <div className={styles.progress} style={{ width: `${((current + 1) / pages.length) * 100}%` }} />
          <div className={styles.hud} data-visible={!barVisible}>
            {current + 1} / {pages.length}
          </div>
          <ControlBar
            visible={barVisible}
            index={current}
            count={pages.length}
            pageName={page.name}
            fullscreen={fullscreen}
            laser={laser}
            gridOpen={overlay === "grid"}
            onBack={onClose}
            onPrevious={() => go(current - 1)}
            onNext={() => go(current + 1)}
            onGrid={() => toggleOverlay("grid")}
            onLaser={() => setLaser((on) => !on)}
            onFullscreen={toggleFullscreen}
            onHelp={() => toggleOverlay("help")}
            onHover={setBarHovered}
          />
        </>
      )}

      {overlay === "grid" && (
        <PageGrid
          pages={pages}
          thumbnails={thumbnails}
          current={current}
          onPick={(i) => {
            go(i);
            setOverlay("none");
          }}
        />
      )}
      {overlay === "help" && <HelpOverlay onClose={() => setOverlay("none")} />}

      {typed && <div className={styles.typed}>Go to page {typed} ↵</div>}
      <div className={styles.toast} data-visible={toast !== null}>
        {toast}
      </div>
    </div>
  );
}
