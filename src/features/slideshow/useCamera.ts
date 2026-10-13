import type { ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import { useEffect, useMemo, useState } from "react";

import { type Camera, fitAll, fitPage, zoomAt } from "../../domain/pages";
import type { Board } from "../../domain/scene";
import type { Page } from "../../domain/types";
import { tokenPx } from "./cssTokens";
import { useViewportSize } from "./useViewportSize";

/** Each zoom button press zooms by this much, up to MAX_ZOOM times the fitted page. */
const ZOOM_STEP = 1.5;
const MAX_ZOOM = 8;
/** In the whole-board view, Ctrl+scrolling this many px zooms by about 2.7 times. */
const WHEEL_ZOOM_PX = 300;

const toAppState = (c: Camera) => ({
  zoom: { value: c.zoom as NormalizedZoomValue },
  scrollX: c.scrollX,
  scrollY: c.scrollY,
});

interface Options {
  api: ExcalidrawImperativeAPI | null;
  /** Excalidraw has settled after mounting, so the camera can be moved. */
  ready: boolean;
  board: Board;
  pages: readonly Page[];
  current: number;
  /** The whole-board view (W) is open. */
  wholeOpen: boolean;
  /** The control bar has its own strip, which the page is fitted around. */
  barPinned: boolean;
}

/**
 * Excalidraw's camera: the current page fitted to the screen, a zoom on it
 * (which lasts until zoomed back out or the page changes), or the
 * whole-board view, moved and zoomed with the wheel. Applied to Excalidraw
 * whenever it changes, and again on every mouse release.
 */
export function useCamera({ api, ready, board, pages, current, wholeOpen, barPinned }: Options) {
  const page = pages[current];
  const { width, height } = useViewportSize();
  // A pinned bar gets its own strip at the bottom, and the page is fitted above it. A workbook is
  // laid out as Excel lays out a sheet: the bar in a strip along the top (where Excel's ribbon is),
  // the sheet tabs in one along the bottom, and the page held to the top of the space between them.
  const barSpace = barPinned ? tokenPx(board.tabs ? "--dock-height" : "--bar-space") : 0;
  const topSpace = board.tabs ? barSpace : 0;
  const view = useMemo(() => {
    // A board is shown as on excalidraw.com: never past 100%, so on a big screen it isn't blown up.
    const fit = board.tabs
      ? fitPage(page, width, height - topSpace - barSpace, "top")
      : fitPage(page, width, height - barSpace, "centre", 1);
    return { ...fit, scrollY: fit.scrollY + topSpace / fit.zoom };
  }, [page, width, height, topSpace, barSpace, board.tabs]);

  // A zoom lasts until zoomed back out or the page changes. Zoomed, dragging pans freely.
  const [zoomed, setZoomed] = useState<{ page: number; camera: Camera } | null>(null);
  const camera = zoomed?.page === current ? zoomed.camera : null;

  /** Excalidraw's camera as it is now, including where a drag with the hand left it. */
  const liveCamera = () => {
    const s = api?.getAppState();
    return s ? { zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY } : (camera ?? view);
  };

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
  const target = wholeOpen ? whole : (camera ?? view);
  const refit = camera ? 0 : releases;
  useEffect(() => {
    if (!api || !ready) return;
    api.updateScene({ appState: toAppState(target) });
  }, [api, ready, target, refit]);

  // Zooms around the middle of the screen, starting from the live camera so a drag is kept.
  const zoomBy = (factor: number) => {
    if (!api) return;
    const s = api.getAppState();
    const from = { zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY };
    const zoom = Math.min(from.zoom * factor, view.zoom * MAX_ZOOM);
    if (zoom <= view.zoom * 1.001) return setZoomed(null);
    setZoomed({ page: current, camera: zoomAt(from, width / 2, (height + topSpace - barSpace) / 2, zoom) });
  };

  return {
    /** The current page fitted to the screen. */
    view,
    /** The zoom on the current page, or null when it's just fitted. */
    camera,
    /** The whole-board view's camera. */
    whole,
    liveCamera,
    /** Space kept for the bar along the top (a workbook's) and the bottom, in px. */
    topSpace,
    barSpace,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    resetZoom: () => setZoomed(null),
    /** Keeps where a drag with the hand left a zoomed page, before another tool stops it panning. */
    holdDrag: () => {
      if (camera && api) setZoomed({ page: current, camera: liveCamera() });
    },
    /** Fits the whole-board view to the current page and its neighbours, as it opens. */
    wholeAround: () => {
      const around = pages.slice(Math.max(0, current - 1), current + 2);
      setWholeMoved(fitAll(around, width, height, tokenPx("--space-8")));
    },
    /** Zooms the whole-board view out to every page at once. */
    showAll: () => setWholeMoved(null),
    // Scrolling moves around the whole-board view, Ctrl+scrolling zooms it around the mouse.
    wheel: (e: WheelEvent) => {
      if (!wholeOpen) return;
      setWholeMoved((moved) => {
        const from = moved ?? wholeFit;
        if (!e.ctrlKey) {
          return { ...from, scrollX: from.scrollX - e.deltaX / from.zoom, scrollY: from.scrollY - e.deltaY / from.zoom };
        }
        const zoom = Math.max(wholeFit.zoom, Math.min(view.zoom * MAX_ZOOM, from.zoom * Math.exp(-e.deltaY / WHEEL_ZOOM_PX)));
        return zoomAt(from, e.clientX, e.clientY, zoom);
      });
    },
  };
}
