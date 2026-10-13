import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { BinaryFiles, ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import { useEffect, useMemo, useState } from "react";

import { canCut, pagesFromCuts } from "../../domain/cuts";
import { type Opacities, opacityOf, withOpacities } from "../../domain/opacity";
import { boardPages, type Camera, DEFAULT_PAGE_HEIGHT, fitAll, fitPage, pageAt, zoomAt } from "../../domain/pages";
import type { Board } from "../../domain/scene";
import { clipboardText, selectionText } from "../../domain/selection";
import { tabOf } from "../../domain/sheetPages";
import type { SceneElement } from "../../domain/types";
import { renderPicture } from "../../lib/render";
import {
  loadBarPinned,
  loadCuts,
  loadLastPage,
  loadMouseMode,
  loadPageHeight,
  type MouseMode,
  saveBarPinned,
  saveCuts,
  saveLastPage,
  saveMouseMode,
  savePageHeight,
} from "../../lib/storage";
import { ControlBar } from "./ControlBar";
import { CutOverview, type CutState } from "./CutOverview";
import { HelpOverlay } from "./HelpOverlay";
import { LaserPointer } from "./LaserPointer";
import { NoteLayer } from "./NoteLayer";
import { PageGrid } from "./PageGrid";
import { type SelectionAction, SelectionLayer } from "./SelectionLayer";
import { SheetTabs } from "./SheetTabs";
import styles from "./Slideshow.module.css";
import { useFullscreen } from "./useFullscreen";
import { usePageThumbnails } from "./usePageThumbnails";
import { usePointerActivity } from "./usePointerActivity";
import { useSlideKeys } from "./useSlideKeys";
import { useToast } from "./useToast";
import { useViewportSize } from "./useViewportSize";

interface Props {
  board: Board;
  /** The page to start on (0-based), e.g. from the address bar. Otherwise the board resumes where it was left. */
  initialPage: number | null;
  onPageChange: (index: number) => void;
  onOpenAnother: () => void;
  onClose: () => void;
}

/** Excalidraw re-centres the scene just after it mounts; wait this long before taking over the camera. */
const SETTLE_MS = 300;
const RESIZE_STEP = 1.1;
/** A typed page number is forgotten after this long without Enter. */
const TYPED_PAGE_MS = 3000;
/** Each zoom button press zooms by this much, up to MAX_ZOOM times the fitted page. */
const ZOOM_STEP = 1.5;
const MAX_ZOOM = 8;
/** In the whole-board view, Ctrl+scrolling this many px zooms by about 2.7 times. */
const WHEEL_ZOOM_PX = 300;
/** How long the list of what a workbook shows differently from Excel stays up. */
const NOT_SHOWN_MS = 8000;

type Overlay = "none" | "grid" | "help" | "whole";
/** What the mouse does on the page: the remembered mode, or the laser for a while. */
export type Tool = MouseMode | "laser";

const toAppState = (c: Camera) => ({
  zoom: { value: c.zoom as NormalizedZoomValue },
  scrollX: c.scrollX,
  scrollY: c.scrollY,
});

/** A token from tokens.css, for values used in JS. */
const cssToken = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** A length token, in px, for layout maths done in JS. */
const tokenPx = (name: string) => parseFloat(cssToken(name)) || 0;

/**
 * Shows one page of a board at a time. Excalidraw runs read-only; this
 * component owns the camera, moving it page to page and covering whatever of
 * the neighbouring pages would still be visible above and below.
 */
export function Slideshow({ board, initialPage, onPageChange, onOpenAnother, onClose }: Props) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [ready, setReady] = useState(false);
  const [pageHeight, setPageHeight] = useState(() => loadPageHeight(board.name) ?? DEFAULT_PAGE_HEIGHT);
  const autoPages = useMemo(() => boardPages(board, pageHeight), [board, pageHeight]);
  // Cuts moved by hand in the whole-board view (W). Like every change made while viewing,
  // they last until the board is closed, unless saved: then they're remembered in this browser.
  const [cuts, setCuts] = useState<readonly number[] | null>(() => loadCuts(board.name));
  const [savedCuts, setSavedCuts] = useState(cuts);
  // A workbook's pages follow its rows and pictures (domain/sheetPages.ts), not cuts.
  const cuttable = !board.pages && canCut(autoPages);
  const pages = useMemo(
    () => (cuts && cuttable ? pagesFromCuts(autoPages, cuts) : autoPages),
    [autoPages, cuts, cuttable],
  );
  const cutsSaved = JSON.stringify(cuts) === JSON.stringify(savedCuts);
  const cutState: CutState = cuts ? (cutsSaved ? "saved" : "unsaved") : cutsSaved ? "automatic" : "automatic-unsaved";
  // Only a resume (no page in the address) is announced.
  const [resumedAt] = useState(() => (initialPage === null ? Math.min(loadLastPage(board.name), pages.length - 1) : 0));
  const [index, setIndex] = useState(() => Math.min(initialPage ?? resumedAt, pages.length - 1));
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [mouseMode, setMouseMode] = useState(loadMouseMode);
  const [laser, setLaser] = useState(false);
  const tool: Tool = laser ? "laser" : mouseMode;
  const [typed, setTyped] = useState("");
  const [barHovered, setBarHovered] = useState(false);
  const [barPinned, setBarPinned] = useState(loadBarPinned);
  const { width, height } = useViewportSize();
  const [toast, showToast] = useToast();
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const pointer = usePointerActivity();
  const thumbnails = usePageThumbnails(board, pages, overlay === "grid");

  const current = Math.min(index, pages.length - 1);
  const page = pages[current];
  // A pinned bar gets its own strip at the bottom (with a workbook's sheet tabs above it), and the page is fitted above it.
  const barSpace = barPinned ? tokenPx("--bar-space") + (board.tabs ? tokenPx("--tabs-space") : 0) : 0;
  const view = useMemo(() => fitPage(page, width, height - barSpace), [page, width, height, barSpace]);

  useEffect(() => {
    if (!api) return;
    const t = setTimeout(() => setReady(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [api]);

  // A zoom lasts until zoomed back out or the page changes. Zoomed, dragging pans freely.
  const [zoomed, setZoomed] = useState<{ page: number; camera: Camera } | null>(null);
  const camera = zoomed?.page === current ? zoomed.camera : null;

  // Like a zoom, a selection belongs to the page it was made on.
  const [selection, setSelection] = useState<{ page: number; elements: SceneElement[] } | null>(null);
  const selected = selection?.page === current ? selection.elements : [];

  /** Excalidraw's camera as it is now, including where a drag with the hand left it. */
  const liveCamera = () => {
    const s = api?.getAppState();
    return s ? { zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY } : (camera ?? view);
  };

  // A workbook's cell notes on this page, read by hovering their cell.
  const pageNotes = useMemo(
    () => (board.notes ?? []).filter((n) => n.y0 >= page.y0 && n.y1 <= page.y1 && n.x0 >= page.x0 && n.x1 <= page.x1),
    [board.notes, page],
  );

  // Opacity changes are only a view: Excalidraw redraws with them, but they last until the
  // board is closed and never reach the file. Copy and the page grid still see the originals.
  const [opacities, setOpacities] = useState<Opacities>({});
  useEffect(() => {
    if (!api || !ready || !Object.keys(opacities).length) return;
    api.updateScene({
      elements: withOpacities(api.getSceneElementsIncludingDeleted(), opacities),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [api, ready, opacities]);

  // In view mode Excalidraw pans on every drag, so the page is re-fitted whenever the mouse is released.
  const [releases, setReleases] = useState(0);
  useEffect(() => {
    const onRelease = () => setReleases((n) => n + 1);
    window.addEventListener("pointerup", onRelease);
    return () => window.removeEventListener("pointerup", onRelease);
  }, []);

  // The whole-board view (W) opens on the current page and its neighbours (a whole board
  // of 30 pages would be a thin strip), then moves with the wheel, out to every page at once.
  const wholeFit = useMemo(() => fitAll(pages, width, height, tokenPx("--space-8")), [pages, width, height]);
  const [wholeMoved, setWholeMoved] = useState<Camera | null>(null);
  const whole = wholeMoved ?? wholeFit;

  // Only a zoomed page keeps where a drag left it; otherwise the camera snaps back on release.
  const target = overlay === "whole" ? whole : (camera ?? view);
  const refit = camera ? 0 : releases;
  useEffect(() => {
    if (!api || !ready) return;
    api.updateScene({ appState: toAppState(target) });
  }, [api, ready, target, refit]);

  useEffect(() => {
    saveLastPage(board.name, current);
    onPageChange(current);
  }, [board.name, current, onPageChange]);

  useEffect(() => {
    if (!ready) return;
    const resumed = resumedAt > 0 ? `Resumed at page ${resumedAt + 1} · Home for page 1` : "";
    if (board.notShown?.length) {
      const note = `Drawn differently from Excel: ${board.notShown.join(", ")}`;
      showToast(resumed ? `${resumed} · ${note}` : note, NOT_SHOWN_MS);
    } else if (resumed) showToast(resumed);
  }, [ready, resumedAt, showToast, board.notShown]);

  useEffect(() => {
    if (!typed) return;
    const t = setTimeout(() => setTyped(""), TYPED_PAGE_MS);
    return () => clearTimeout(t);
  }, [typed]);

  // Hand and select are remembered; the laser is picked again to turn it off.
  // Only the hand pans, so leaving it while zoomed first keeps the view where a drag left it.
  const chooseTool = (t: Tool) => {
    if (tool === "hand" && t !== "hand" && camera && api) {
      const s = api.getAppState();
      setZoomed({ page: current, camera: { zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY } });
    }
    if (t === "laser") {
      setLaser((on) => !on);
    } else {
      setLaser(false);
      setMouseMode(t);
      saveMouseMode(t);
    }
    setSelection(null);
  };

  // What can be done with selected elements. The board itself is never changed.
  const selectionActions: SelectionAction[] = [
    {
      label: "Copy",
      shortcut: "Ctrl+C",
      run: (els) =>
        navigator.clipboard.writeText(clipboardText(els, board.files)).then(
          () => showToast(`Copied ${els.length} · paste into Excalidraw`),
          () => showToast("The browser didn't allow copying"),
        ),
    },
    {
      label: "Copy image",
      // As seen on screen, opacity changes included. The picture is handed over while it's
      // still being drawn, so the browser counts the copy as coming from the click.
      run: (els) =>
        navigator.clipboard
          .write([new ClipboardItem({ "image/png": renderPicture(withOpacities(els, opacities), board) })])
          .then(
            () => showToast("Copied as an image · paste it anywhere"),
            () => showToast("The browser didn't allow copying"),
          ),
    },
    {
      label: "Copy text",
      run: (els) => {
        const text = selectionText(els);
        if (!text) return showToast("No writing in the selection");
        navigator.clipboard.writeText(text).then(
          () => showToast("Copied the text"),
          () => showToast("The browser didn't allow copying"),
        );
      },
    },
    {
      label: "Reset",
      // Selected elements come from the board, so they carry its own opacities.
      run: (els) => setOpacities((o) => ({ ...o, ...Object.fromEntries(els.map((e) => [e.id, e.opacity ?? 100])) })),
    },
  ];

  const go = (i: number) => setIndex(Math.max(0, Math.min(pages.length - 1, i)));
  const toggleOverlay = (o: Overlay) => setOverlay((cur) => (cur === o ? "none" : o));

  const toggleWhole = () => {
    const around = pages.slice(Math.max(0, current - 1), current + 2);
    setWholeMoved(fitAll(around, width, height, tokenPx("--space-8")));
    toggleOverlay("whole");
  };

  // New cuts keep the same part of the board on screen.
  const changeCuts = (next: readonly number[] | null) => {
    const nextPages = next ? pagesFromCuts(autoPages, next) : autoPages;
    setIndex(pageAt(nextPages, (page.y0 + page.y1) / 2));
    setCuts(next);
  };

  const saveCutsNow = () => {
    saveCuts(board.name, cuts);
    setSavedCuts(cuts);
  };

  // Scrolling moves around the whole-board view, Ctrl+scrolling zooms it around the mouse.
  const wheel = (e: WheelEvent) => {
    if (overlay !== "whole") return;
    setWholeMoved((moved) => {
      const from = moved ?? wholeFit;
      if (!e.ctrlKey) {
        return { ...from, scrollX: from.scrollX - e.deltaX / from.zoom, scrollY: from.scrollY - e.deltaY / from.zoom };
      }
      const zoom = Math.max(wholeFit.zoom, Math.min(view.zoom * MAX_ZOOM, from.zoom * Math.exp(-e.deltaY / WHEEL_ZOOM_PX)));
      return zoomAt(from, e.clientX, e.clientY, zoom);
    });
  };

  const resizePages = (factor: number) => {
    if (board.pages) {
      showToast("A workbook's pages follow its rows and pictures");
      return;
    }
    if (cuts && cuttable) {
      showToast("This board's pages are cut by hand · W to change them");
      return;
    }
    const next = Math.round(pageHeight * factor);
    const nextPages = boardPages(board, next);
    if (nextPages.every((p) => p.frameId)) {
      showToast("This board uses its frames as pages");
      return;
    }
    setIndex(pageAt(nextPages, (page.y0 + page.y1) / 2));
    setPageHeight(next);
    savePageHeight(board.name, next);
    showToast(`${nextPages.length} pages`);
  };

  // Zooms around the middle of the screen, starting from the live camera so a drag is kept.
  const zoomBy = (factor: number) => {
    if (!api) return;
    const s = api.getAppState();
    const from = { zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY };
    const zoom = Math.min(from.zoom * factor, view.zoom * MAX_ZOOM);
    if (zoom <= view.zoom * 1.001) return setZoomed(null);
    setZoomed({ page: current, camera: zoomAt(from, width / 2, (height - barSpace) / 2, zoom) });
  };

  useSlideKeys(ready, {
    next: () => go(current + 1),
    previous: () => go(current - 1),
    first: () => go(0),
    last: () => go(pages.length - 1),
    smaller: () => resizePages(1 / RESIZE_STEP),
    bigger: () => resizePages(RESIZE_STEP),
    grid: () => toggleOverlay("grid"),
    whole: toggleWhole,
    wheel,
    help: () => toggleOverlay("help"),
    fullscreen: toggleFullscreen,
    bar: () =>
      setBarPinned((pinned) => {
        saveBarPinned(!pinned);
        return !pinned;
      }),
    laser: () => chooseTool("laser"),
    mouseMode: () => chooseTool(tool === "select" ? "hand" : "select"),
    open: onOpenAnother,
    digit: (d) => setTyped((t) => (t + d).slice(-4)),
    enter: () => {
      if (typed) go(Number(typed) - 1);
      setTyped("");
      setOverlay("none");
    },
    // Esc backs out one step at a time: typed number, overlay, selection, laser, then the board.
    close: () => {
      if (typed) setTyped("");
      else if (overlay !== "none") setOverlay("none");
      else if (selected.length) setSelection(null);
      else if (laser) setLaser(false);
      else onClose();
    },
  });

  const initialData = useMemo(
    () => ({
      elements: board.elements as never,
      files: board.files as BinaryFiles,
      // Around a workbook's pages, the app's own dark background (the sheets keep their colours).
      appState: { viewBackgroundColor: board.exactColors ? cssToken("--bg") : board.background },
    }),
    [board],
  );

  // The bar is always shown unless hidden with H. Hidden, it comes back while
  // the mouse moves; with the laser on, only when the mouse heads for the bottom edge.
  const barVisible =
    ready &&
    overlay !== "whole" &&
    (barPinned || overlay !== "none" || barHovered || (pointer.moving && (tool !== "laser" || pointer.nearBottom)));

  return (
    <div className={styles.stage} data-cursor-hidden={ready && !pointer.moving && !laser}>
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initialData}
        theme={board.exactColors ? "light" : "dark"}
        viewModeEnabled
        zenModeEnabled
        UIOptions={{ canvasActions: { toggleTheme: false } }}
      />
      {!camera && overlay !== "whole" && (
        <>
          <div className={styles.mask} style={{ top: 0, height: view.marginY }} />
          <div className={styles.mask} style={{ bottom: 0, height: view.marginY + barSpace }} />
        </>
      )}

      {tool === "laser" && overlay !== "whole" && <LaserPointer />}
      {tool === "select" && ready && overlay !== "whole" && (
        <SelectionLayer
          elements={board.elements}
          camera={camera ?? view}
          selected={selected}
          onSelect={(elements) => setSelection({ page: current, elements })}
          actions={selectionActions}
          page={page}
          opacity={selected.length ? opacityOf(selected[0], opacities) : 100}
          onOpacity={(value) =>
            setOpacities((o) => ({ ...o, ...Object.fromEntries(selected.map((e) => [e.id, value])) }))
          }
        />
      )}
      {ready && overlay === "none" && pageNotes.length > 0 && <NoteLayer notes={pageNotes} camera={liveCamera} />}
      {!ready && <div className={styles.loading}>Loading {board.name}…</div>}

      {ready && (
        <>
          <div className={styles.progress} style={{ width: `${((current + 1) / pages.length) * 100}%` }} />
          <div className={styles.hud} data-visible={!barVisible}>
            {current + 1} / {pages.length}
          </div>
          {board.tabs && overlay !== "whole" && (
            <SheetTabs
              tabs={board.tabs}
              current={tabOf(board.tabs, current)}
              visible={barVisible}
              onPick={(tab) => go(tab.firstPage)}
              onHover={setBarHovered}
            />
          )}
          <ControlBar
            visible={barVisible}
            index={current}
            count={pages.length}
            pageName={page.name}
            fullscreen={fullscreen}
            tool={tool}
            gridOpen={overlay === "grid"}
            zoom={camera ? camera.zoom / view.zoom : 1}
            onBack={onClose}
            onPrevious={() => go(current - 1)}
            onNext={() => go(current + 1)}
            onGrid={() => toggleOverlay("grid")}
            onZoomIn={() => zoomBy(ZOOM_STEP)}
            onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
            onZoomReset={() => setZoomed(null)}
            onTool={chooseTool}
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
      {overlay === "whole" && ready && (
        <CutOverview
          pages={pages}
          current={current}
          camera={whole}
          editable={cuttable}
          lockedNote={board.pages ? "A workbook's pages follow its rows and pictures" : "This board uses its frames as pages"}
          state={cutState}
          onCuts={changeCuts}
          onSave={saveCutsNow}
          onAutomatic={() => changeCuts(null)}
          onShowAll={() => setWholeMoved(null)}
          onPick={(i) => {
            go(i);
            setOverlay("none");
          }}
          onClose={() => setOverlay("none")}
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
