import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, useMemo, useRef, useState } from "react";

import { textSizeFor } from "../../domain/additions";
import { type Opacities, opacityOf } from "../../domain/opacity";
import { pageAt } from "../../domain/pages";
import type { Board } from "../../domain/scene";
import { tabOf } from "../../domain/sheetPages";
import type { Page, SceneElement } from "../../domain/types";
import {
  loadBarPinned,
  loadLastPage,
  loadMouseMode,
  type MouseMode,
  saveBarPinned,
  saveLastPage,
  saveMouseMode,
} from "../../lib/storage";
import { AddedLayer } from "./AddedLayer";
import { type Confirm, ConfirmDialog } from "./ConfirmDialog";
import { ControlBar } from "./ControlBar";
import { cssToken } from "./cssTokens";
import { CutOverview } from "./CutOverview";
import { HelpOverlay } from "./HelpOverlay";
import { LaserPointer } from "./LaserPointer";
import { NoteLayer } from "./NoteLayer";
import { PageGrid } from "./PageGrid";
import { addedLayer, opacityLayer, useSceneLayers } from "./sceneLayers";
import { selectionActions } from "./selectionActions";
import { SelectionLayer } from "./SelectionLayer";
import { SheetTabs } from "./SheetTabs";
import styles from "./Slideshow.module.css";
import { TextLayer } from "./TextLayer";
import { useAdditions } from "./useAdditions";
import { useCamera } from "./useCamera";
import { useFullscreen } from "./useFullscreen";
import { usePages } from "./usePages";
import { usePageThumbnails } from "./usePageThumbnails";
import { usePointerActivity } from "./usePointerActivity";
import { useSlideKeys } from "./useSlideKeys";
import { useToast } from "./useToast";

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
/** How long the list of what a workbook shows differently from Excel stays up. */
const NOT_SHOWN_MS = 8000;

type Overlay = "none" | "grid" | "help" | "whole";
/** What the mouse does on the page: the remembered mode, or the laser or text tool for a while. */
type Temporary = "laser" | "text";
export type Tool = MouseMode | Temporary;

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
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const pointer = usePointerActivity();

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const current = Math.min(index, pages.length - 1);
  const page = pages[current];
  const { additions, added, shown, unsaved, addText, addImages, change, remove, askSave, askDiscard, guardLeave } =
    useAdditions(board, page, showToast, setConfirm);
  const thumbnails = usePageThumbnails(shown, pages, overlay === "grid");
  const { view, camera, whole, liveCamera, topSpace, barSpace, zoomIn, zoomOut, resetZoom, holdDrag, wholeAround, showAll, wheel } =
    useCamera({ api, ready, board, pages, current, wholeOpen: overlay === "whole", barPinned });

  useEffect(() => {
    if (!api) return;
    const t = setTimeout(() => setReady(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [api]);

  // Like a zoom, a selection belongs to the page it was made on.
  const [selection, setSelection] = useState<{ page: number; elements: SceneElement[] } | null>(null);
  const selected = selection?.page === current ? selection.elements : [];

  // A workbook's cell notes on this page, read by hovering their cell.
  const pageNotes = useMemo(
    () => (board.notes ?? []).filter((n) => n.y0 >= page.y0 && n.y1 <= page.y1 && n.x0 >= page.x0 && n.x1 <= page.x1),
    [board.notes, page],
  );

  // What Excalidraw draws on top of the board for this viewing: the additions, then opacity
  // changes. Like every change made while viewing, they last until the board is closed and never reach the file.
  const [opacities, setOpacities] = useState<Opacities>({});
  const layers = useMemo(() => [addedLayer(added), opacityLayer(opacities)], [added, opacities]);
  useSceneLayers(api, ready, layers);

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
    if (tool === "hand" && t !== "hand") holdDrag();
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
    wholeAround();
    toggleOverlay("whole");
  };

  /** New pages keep the same part of the board on screen. */
  function keepSpot(next: readonly Page[]) {
    setIndex(pageAt(next, (page.y0 + page.y1) / 2));
  }

  const close = guardLeave(onClose);
  const openAnother = guardLeave(onOpenAnother);

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
      onZoomIn={zoomIn}
      onZoomOut={zoomOut}
      onZoomReset={resetZoom}
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
          onAdd={(at, text) => {
            addText(at, text);
            setTemporary(null);
          }}
          onCancel={() => setTemporary(null)}
        />
      )}
      {ready && overlay !== "whole" && added.elements.length > 0 && (
        <AddedLayer
          additions={additions}
          elements={added.elements}
          camera={camera ?? view}
          grab={tool === "select"}
          onChange={change}
          onRemove={remove}
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
          onShowAll={showAll}
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
