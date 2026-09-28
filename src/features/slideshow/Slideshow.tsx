import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { BinaryFiles, ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import { useEffect, useMemo, useState } from "react";

import { type Opacities, opacityOf, screenOpacities, withOpacities } from "../../domain/opacity";
import { boardPages, type Camera, DEFAULT_PAGE_HEIGHT, fitPage, pageAt, zoomAt } from "../../domain/pages";
import { addStep, hiddenIds, inSteps, removeFromSteps, type Steps } from "../../domain/reveal";
import type { Board } from "../../domain/scene";
import { clipboardText, selectionText } from "../../domain/selection";
import type { SceneElement } from "../../domain/types";
import { renderPicture } from "../../lib/render";
import {
  loadBarPinned,
  loadLastPage,
  loadMouseMode,
  loadPageHeight,
  type MouseMode,
  saveBarPinned,
  saveLastPage,
  saveMouseMode,
  savePageHeight,
} from "../../lib/storage";
import { ControlBar } from "./ControlBar";
import { HelpOverlay } from "./HelpOverlay";
import { LaserPointer } from "./LaserPointer";
import { PageGrid } from "./PageGrid";
import { type SelectionAction, SelectionLayer } from "./SelectionLayer";
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

/** A page without reveal steps. One shared value, so memos depending on it stay put. */
const NO_STEPS: Steps = [];

type Overlay = "none" | "grid" | "help";
/** What the mouse does on the page: the remembered mode, or the laser for a while. */
export type Tool = MouseMode | "laser";

const toAppState = (c: Camera) => ({
  zoom: { value: c.zoom as NormalizedZoomValue },
  scrollX: c.scrollX,
  scrollY: c.scrollY,
});

/** A length token from tokens.css, in px, for layout maths done in JS. */
const tokenPx = (name: string) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

/**
 * Shows one page of a board at a time. Excalidraw runs read-only; this
 * component owns the camera, moving it page to page and covering whatever of
 * the neighbouring pages would still be visible above and below.
 */
export function Slideshow({ board, initialPage, onPageChange, onOpenAnother, onClose }: Props) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [ready, setReady] = useState(false);
  const [pageHeight, setPageHeight] = useState(() => loadPageHeight(board.name) ?? DEFAULT_PAGE_HEIGHT);
  const pages = useMemo(() => boardPages(board, pageHeight), [board, pageHeight]);
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
  // A pinned bar gets its own strip at the bottom, and the page is fitted above it.
  const barSpace = barPinned ? tokenPx("--bar-space") : 0;
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

  // Reveal steps per page, and how many of the current page's are showing. Arriving with →
  // or a jump shows none; arriving with ← shows them all (see `previous`).
  const [steps, setSteps] = useState<Record<number, Steps>>({});
  const [shown, setShown] = useState({ page: current, count: 0 });
  const pageSteps = steps[current] ?? NO_STEPS;
  const revealed = shown.page === current ? Math.min(shown.count, pageSteps.length) : 0;
  const stepLabel = pageSteps.length ? `step ${revealed}/${pageSteps.length}` : "";
  const hidden = useMemo(() => hiddenIds(pageSteps, revealed), [pageSteps, revealed]);
  const hideable = useMemo(() => new Set(Object.values(steps).flat(2)), [steps]);
  // Hidden elements can't be picked by the select tool.
  const pickable = useMemo(
    () => (hidden.size ? board.elements.filter((e) => !hidden.has(e.id)) : board.elements),
    [board, hidden],
  );

  // Opacity changes and hidden steps are only a view: Excalidraw redraws with them, but they
  // last until the board is closed and never reach the file. Copy and the page grid still see
  // the originals.
  const [opacities, setOpacities] = useState<Opacities>({});
  const onScreen = useMemo(
    () => screenOpacities(board.elements, opacities, hideable, hidden),
    [board, opacities, hideable, hidden],
  );
  useEffect(() => {
    if (!api || !ready || !Object.keys(onScreen).length) return;
    api.updateScene({
      elements: withOpacities(api.getSceneElementsIncludingDeleted(), onScreen),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [api, ready, onScreen]);

  // In view mode Excalidraw pans on every drag, so the page is re-fitted whenever the mouse is released.
  const [releases, setReleases] = useState(0);
  useEffect(() => {
    const onRelease = () => setReleases((n) => n + 1);
    window.addEventListener("pointerup", onRelease);
    return () => window.removeEventListener("pointerup", onRelease);
  }, []);

  useEffect(() => {
    if (!api || !ready || camera) return;
    api.updateScene({ appState: toAppState(view) });
  }, [api, ready, view, releases, camera]);

  useEffect(() => {
    if (!api || !ready || !camera) return;
    api.updateScene({ appState: toAppState(camera) });
  }, [api, ready, camera]);

  useEffect(() => {
    saveLastPage(board.name, current);
    onPageChange(current);
  }, [board.name, current, onPageChange]);

  useEffect(() => {
    if (ready && resumedAt > 0) showToast(`Resumed at page ${resumedAt + 1} · Home for page 1`);
  }, [ready, resumedAt, showToast]);

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
      label: "Add step",
      // Stays visible while steps are being set up; hidden the next time the page is arrived at.
      run: (els) => {
        const next = addStep(pageSteps, els.map((e) => e.id));
        setSteps((s) => ({ ...s, [current]: next }));
        setShown({ page: current, count: next.length });
        showToast(`Step ${next.length} of this page · → will show it`);
      },
    },
    {
      label: "Remove step",
      available: (els) => inSteps(pageSteps, els.map((e) => e.id)),
      run: (els) => {
        const next = removeFromSteps(pageSteps, els.map((e) => e.id));
        setSteps((s) => ({ ...s, [current]: next }));
        setShown({ page: current, count: next.length });
        showToast(next.length ? `${next.length} steps left on this page` : "No steps left on this page");
      },
    },
    {
      label: "Reset",
      // Selected elements come from the board, so they carry its own opacities.
      run: (els) => setOpacities((o) => ({ ...o, ...Object.fromEntries(els.map((e) => [e.id, e.opacity ?? 100])) })),
    },
  ];

  // Arrives on page i with `revealed` of its steps showing: none, unless coming back with ←.
  const go = (i: number, revealed = 0) => {
    const to = Math.max(0, Math.min(pages.length - 1, i));
    setIndex(to);
    setShown({ page: to, count: revealed });
  };
  // → shows the page’s next hidden step before moving on; ← hides the last one shown before
  // going back, and arrives on the previous page with all its steps showing.
  const next = () => (revealed < pageSteps.length ? setShown({ page: current, count: revealed + 1 }) : go(current + 1));
  const previous = () => {
    if (revealed > 0) return setShown({ page: current, count: revealed - 1 });
    if (current > 0) go(current - 1, steps[current - 1]?.length ?? 0);
  };
  const toggleOverlay = (o: Overlay) => setOverlay((cur) => (cur === o ? "none" : o));

  const resizePages = (factor: number) => {
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
    next,
    previous,
    first: () => go(0),
    last: () => go(pages.length - 1),
    smaller: () => resizePages(1 / RESIZE_STEP),
    bigger: () => resizePages(RESIZE_STEP),
    grid: () => toggleOverlay("grid"),
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
      appState: { viewBackgroundColor: board.background },
    }),
    [board],
  );

  // The bar is always shown unless hidden with H. Hidden, it comes back while
  // the mouse moves; with the laser on, only when the mouse heads for the bottom edge.
  const barVisible =
    ready &&
    (barPinned || overlay !== "none" || barHovered || (pointer.moving && (tool !== "laser" || pointer.nearBottom)));

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
      {!camera && (
        <>
          <div className={styles.mask} style={{ top: 0, height: view.marginY }} />
          <div className={styles.mask} style={{ bottom: 0, height: view.marginY + barSpace }} />
        </>
      )}

      {tool === "laser" && <LaserPointer />}
      {tool === "select" && ready && (
        <SelectionLayer
          elements={pickable}
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
      {!ready && <div className={styles.loading}>Loading {board.name}…</div>}

      {ready && (
        <>
          <div className={styles.progress} style={{ width: `${((current + 1) / pages.length) * 100}%` }} />
          <div className={styles.hud} data-visible={!barVisible}>
            {current + 1} / {pages.length}
            {stepLabel && ` · ${stepLabel}`}
          </div>
          <ControlBar
            visible={barVisible}
            index={current}
            count={pages.length}
            step={stepLabel}
            canPrevious={current > 0 || revealed > 0}
            canNext={current < pages.length - 1 || revealed < pageSteps.length}
            pageName={page.name}
            fullscreen={fullscreen}
            tool={tool}
            gridOpen={overlay === "grid"}
            zoom={camera ? camera.zoom / view.zoom : 1}
            onBack={onClose}
            onPrevious={previous}
            onNext={next}
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
      {overlay === "help" && <HelpOverlay onClose={() => setOverlay("none")} />}

      {typed && <div className={styles.typed}>Go to page {typed} ↵</div>}
      <div className={styles.toast} data-visible={toast !== null}>
        {toast}
      </div>
    </div>
  );
}
