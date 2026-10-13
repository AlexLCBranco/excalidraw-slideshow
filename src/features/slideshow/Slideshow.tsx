import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { BinaryFiles, ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import { useEffect, useMemo, useRef, useState } from "react";

import { type Addition, isAdded, newId, placeImage, removeAddition, replaceAddition, textSizeFor } from "../../domain/additions";
import { type Opacities, opacityOf, withOpacities } from "../../domain/opacity";
import { type Camera, fitAll, fitPage, pageAt, zoomAt } from "../../domain/pages";
import type { Board } from "../../domain/scene";
import { tabOf } from "../../domain/sheetPages";
import type { Page, SceneElement } from "../../domain/types";
import { additionScene, readImage } from "../../lib/additions";
import {
  loadAdditions,
  loadBarPinned,
  loadLastPage,
  loadMouseMode,
  type MouseMode,
  saveAdditions,
  saveBarPinned,
  saveLastPage,
  saveMouseMode,
} from "../../lib/storage";
import { AddedLayer } from "./AddedLayer";
import { type Confirm, ConfirmDialog } from "./ConfirmDialog";
import { ControlBar } from "./ControlBar";
import { CutOverview } from "./CutOverview";
import { HelpOverlay } from "./HelpOverlay";
import { LaserPointer } from "./LaserPointer";
import { NoteLayer } from "./NoteLayer";
import { PageGrid } from "./PageGrid";
import { selectionActions } from "./selectionActions";
import { SelectionLayer } from "./SelectionLayer";
import { SheetTabs } from "./SheetTabs";
import styles from "./Slideshow.module.css";
import { TextLayer } from "./TextLayer";
import { useFullscreen } from "./useFullscreen";
import { usePages } from "./usePages";
import { usePageThumbnails } from "./usePageThumbnails";
import { usePointerActivity } from "./usePointerActivity";
import { isTyping, useSlideKeys } from "./useSlideKeys";
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
/** What the mouse does on the page: the remembered mode, or the laser or text tool for a while. */
type Temporary = "laser" | "text";
export type Tool = MouseMode | Temporary;

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
  const [toast, showToast] = useToast();
  const { pages, cuttable, cutState, changeCuts, saveCuts, smaller, bigger } = usePages(board, showToast, keepSpot);
  // Only a resume (no page in the address) is announced.
  const [resumedAt] = useState(() => (initialPage === null ? Math.min(loadLastPage(board.name), pages.length - 1) : 0));
  const [index, setIndex] = useState(() => Math.min(initialPage ?? resumedAt, pages.length - 1));
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [mouseMode, setMouseMode] = useState(loadMouseMode);
  const [temporary, setTemporary] = useState<Temporary | null>(null);
  const tool: Tool = temporary ?? mouseMode;
  const [typed, setTyped] = useState("");
  const [barHovered, setBarHovered] = useState(false);
  const [barPinned, setBarPinned] = useState(loadBarPinned);
  const { width, height } = useViewportSize();
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const pointer = usePointerActivity();

  // Text and pictures added on top of the board. Like every change made while viewing, they
  // last until the board is closed unless saved, and then only in this browser: the file is never changed.
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [savedAdditions, setSavedAdditions] = useState<Addition[]>(additions);
  const unsaved = additions !== savedAdditions;
  useEffect(() => {
    let cancelled = false;
    void loadAdditions(board.name).then((saved) => {
      if (cancelled) return;
      // Anything added while they were loading is kept, on top of the saved ones.
      setAdditions((cur) => (cur.length ? [...saved, ...cur] : saved));
      setSavedAdditions(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [board.name]);
  const added = useMemo(() => additionScene(additions), [additions]);
  // The board as shown: its own drawing with the additions on top, for selecting, copying and the page grid.
  const shown = useMemo<Board>(
    () =>
      additions.length
        ? { ...board, elements: [...board.elements, ...added.elements], files: { ...board.files, ...added.files } }
        : board,
    [board, added, additions.length],
  );
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const thumbnails = usePageThumbnails(shown, pages, overlay === "grid");

  const current = Math.min(index, pages.length - 1);
  const page = pages[current];
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
  // Additions are drawn the same way, swapped into Excalidraw's scene on top of the board's own elements.
  const [opacities, setOpacities] = useState<Opacities>({});
  useEffect(() => {
    if (!api || !ready) return;
    api.addFiles(Object.values(added.files));
    const own = api.getSceneElementsIncludingDeleted().filter((e) => !isAdded(e.id));
    api.updateScene({
      elements: withOpacities([...own, ...(added.elements as unknown as typeof own)], opacities),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [api, ready, opacities, added]);

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
    if (t === "laser" || t === "text") {
      setTemporary((on) => (on === t ? null : t));
    } else {
      setTemporary(null);
      setMouseMode(t);
      saveMouseMode(t);
    }
    setSelection(null);
  };

  const actions = selectionActions({ shown, opacities, setOpacities, showToast });

  const go = (i: number) => setIndex(Math.max(0, Math.min(pages.length - 1, i)));
  const toggleOverlay = (o: Overlay) => setOverlay((cur) => (cur === o ? "none" : o));

  const toggleWhole = () => {
    const around = pages.slice(Math.max(0, current - 1), current + 2);
    setWholeMoved(fitAll(around, width, height, tokenPx("--space-8")));
    toggleOverlay("whole");
  };

  /** New pages keep the same part of the board on screen. */
  function keepSpot(next: readonly Page[]) {
    setIndex(pageAt(next, (page.y0 + page.y1) / 2));
  }

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

  // Zooms around the middle of the screen, starting from the live camera so a drag is kept.
  const zoomBy = (factor: number) => {
    if (!api) return;
    const s = api.getAppState();
    const from = { zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY };
    const zoom = Math.min(from.zoom * factor, view.zoom * MAX_ZOOM);
    if (zoom <= view.zoom * 1.001) return setZoomed(null);
    setZoomed({ page: current, camera: zoomAt(from, width / 2, (height + topSpace - barSpace) / 2, zoom) });
  };

  const addText = (at: { x: number; y: number }, text: string) => {
    setAdditions((cur) => [...cur, { kind: "text", id: newId(), x: at.x, y: at.y, text, fontSize: textSizeFor(page) }]);
    setTemporary(null);
  };

  // Pictures go in the middle of the page, shrunk to fit; drag one to move it, its corner to resize it.
  const addImages = async (files: readonly File[]) => {
    for (const file of files.filter((f) => f.type.startsWith("image/"))) {
      try {
        const { dataURL, mimeType, width, height } = await readImage(file);
        const box = placeImage(page, width, height);
        const image: Addition = {
          kind: "image",
          id: newId(),
          x: box.x0,
          y: box.y0,
          width: box.x1 - box.x0,
          height: box.y1 - box.y0,
          dataURL,
          mimeType,
        };
        setAdditions((cur) => [...cur, image]);
      } catch {
        showToast(`Couldn't read ${file.name} as a picture`);
      }
    }
  };

  // A picture pasted with Ctrl+V is added too. Nothing pasted reaches Excalidraw, which would put it in the board.
  const latestAddImages = useRef(addImages);
  useEffect(() => {
    latestAddImages.current = addImages;
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.some((f) => f.type.startsWith("image/"))) void latestAddImages.current(files);
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, []);

  const removeAdded = (id: string) =>
    setConfirm({
      question: `Remove this added ${additions.find((a) => a.id === id)?.kind === "image" ? "picture" : "text"}?`,
      detail: savedAdditions.some((a) => a.id === id) ? "It stays saved until you press Save changes." : undefined,
      choices: [{ label: "Remove", danger: true, run: () => setAdditions((cur) => removeAddition(cur, id)) }],
    });

  /** Stores the additions in this browser. Resolves to whether that worked. */
  const persist = async () => {
    const ok = await saveAdditions(board.name, additions);
    if (ok) setSavedAdditions(additions);
    showToast(ok ? "Saved in this browser · the board file is unchanged" : "Couldn't save: the browser's storage is unavailable or full");
    return ok;
  };

  const askSave = () =>
    setConfirm({
      question: "Save your changes?",
      detail: "What you added will show every time you open this board in this browser. The board file itself is never changed.",
      choices: [{ label: "Save changes", run: () => void persist() }],
    });

  const askDiscard = () =>
    setConfirm({
      question: "Discard your changes?",
      detail: "Everything added or removed since the last save is undone.",
      choices: [{ label: "Discard", danger: true, run: () => setAdditions(savedAdditions) }],
    });

  /** Leaving the board with unsaved additions asks first. */
  const guardLeave = (go: () => void) => () => {
    if (!unsaved) return go();
    setConfirm({
      question: "Save your changes before leaving?",
      detail: "Unsaved additions are lost when you leave the board.",
      choices: [
        { label: "Don't save", danger: true, run: go },
        { label: "Save changes", run: () => void persist().then((ok) => ok && go()) },
      ],
    });
  };
  const close = guardLeave(onClose);
  const openAnother = guardLeave(onOpenAnother);

  // Closing the tab or window with unsaved additions gets the browser's own "Leave site?".
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  useSlideKeys(ready && !confirm, {
    next: () => go(current + 1),
    previous: () => go(current - 1),
    first: () => go(0),
    last: () => go(pages.length - 1),
    smaller,
    bigger,
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
    text: () => chooseTool("text"),
    image: () => imageInput.current?.click(),
    mouseMode: () => chooseTool(tool === "select" ? "hand" : "select"),
    open: openAnother,
    digit: (d) => setTyped((t) => (t + d).slice(-4)),
    enter: () => {
      if (typed) go(Number(typed) - 1);
      setTyped("");
      setOverlay("none");
    },
    // Esc backs out one step at a time: typed number, overlay, selection, laser or text tool, then the board.
    close: () => {
      if (typed) setTyped("");
      else if (overlay !== "none") setOverlay("none");
      else if (selected.length) setSelection(null);
      else if (temporary) setTemporary(null);
      else close();
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

  // Floating, or in a workbook's strip next to its sheet tabs.
  const controlBar = (
    <ControlBar
      visible={barVisible}
      docked={Boolean(board.tabs)}
      index={current}
      count={pages.length}
      pageName={page.name}
      fullscreen={fullscreen}
      tool={tool}
      gridOpen={overlay === "grid"}
      zoom={camera?.zoom ?? view.zoom}
      zoomedIn={camera !== null}
      onBack={close}
      onPrevious={() => go(current - 1)}
      onNext={() => go(current + 1)}
      onGrid={() => toggleOverlay("grid")}
      onZoomIn={() => zoomBy(ZOOM_STEP)}
      onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
      onZoomReset={() => setZoomed(null)}
      onTool={chooseTool}
      onAddImage={() => imageInput.current?.click()}
      onFullscreen={toggleFullscreen}
      onHelp={() => toggleOverlay("help")}
      onHover={setBarHovered}
    />
  );

  return (
    <div className={styles.stage} data-cursor-hidden={ready && !pointer.moving && !temporary && !confirm}>
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
          {/* A page that isn't zoomed is a slide: fixed on the screen, so the hand's drags never reach Excalidraw. */}
          {tool === "hand" && <div className={styles.pin} data-testid="pin" />}
          <div className={styles.mask} style={{ top: 0, height: view.marginTop + topSpace }} />
          {/* Below a workbook page, its empty cells carry on, as in Excel. Rounded up, so no hairline of background shows between. */}
          <div className={styles.mask} style={{ bottom: 0, height: Math.ceil(view.marginBottom + barSpace), background: page.paper }} />
        </>
      )}

      {tool === "laser" && overlay !== "whole" && <LaserPointer />}
      {tool === "select" && ready && overlay !== "whole" && (
        <SelectionLayer
          elements={shown.elements}
          camera={camera ?? view}
          selected={selected}
          onSelect={(elements) => setSelection({ page: current, elements })}
          actions={actions}
          page={page}
          opacity={selected.length ? opacityOf(selected[0], opacities) : 100}
          onOpacity={(value) =>
            setOpacities((o) => ({ ...o, ...Object.fromEntries(selected.map((e) => [e.id, value])) }))
          }
        />
      )}
      {tool === "text" && ready && overlay !== "whole" && (
        <TextLayer
          key={current}
          camera={camera ?? view}
          fontSize={textSizeFor(page)}
          onAdd={addText}
          onCancel={() => setTemporary(null)}
        />
      )}
      {ready && overlay !== "whole" && added.elements.length > 0 && (
        <AddedLayer
          additions={additions}
          elements={added.elements}
          camera={camera ?? view}
          grab={tool === "select"}
          onChange={(next) => setAdditions((cur) => replaceAddition(cur, next))}
          onRemove={removeAdded}
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
          {board.tabs ? (
            <>
              <div
                className={styles.dock}
                data-edge="top"
                data-visible={barVisible}
                onMouseEnter={() => setBarHovered(true)}
                onMouseLeave={() => setBarHovered(false)}
              >
                {controlBar}
              </div>
              <div
                className={styles.dock}
                data-edge="bottom"
                data-visible={barVisible}
                onMouseEnter={() => setBarHovered(true)}
                onMouseLeave={() => setBarHovered(false)}
              >
                <SheetTabs tabs={board.tabs} current={tabOf(board.tabs, current)} onPick={(tab) => go(tab.firstPage)} />
              </div>
            </>
          ) : (
            controlBar
          )}
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
          onSave={saveCuts}
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

      {ready && unsaved && overlay !== "whole" && (
        <div className={styles.saveBar} onMouseDown={(e) => e.preventDefault()} role="status">
          <span className={styles.saveStatus}>Unsaved changes</span>
          <button className={styles.saveButton} onClick={askDiscard}>
            Discard
          </button>
          <button className={styles.saveButton} data-primary onClick={askSave}>
            Save changes
          </button>
        </div>
      )}
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void addImages([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {confirm && <ConfirmDialog confirm={confirm} onDone={() => setConfirm(null)} />}

      {typed && <div className={styles.typed}>Go to page {typed} ↵</div>}
      <div className={styles.toast} data-visible={toast !== null} style={{ marginTop: topSpace }}>
        {toast}
      </div>
    </div>
  );
}
