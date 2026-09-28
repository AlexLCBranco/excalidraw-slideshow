import { useState } from "react";

import { addCut, cutsOf, moveCut } from "../../domain/cuts";
import type { Camera } from "../../domain/pages";
import { pointToScene, toScreen } from "../../domain/selection";
import type { Page } from "../../domain/types";
import styles from "./CutOverview.module.css";

/** Whether the cuts are the automatic ones or the owner's, and whether that's what's saved. */
export type CutState = "automatic" | "automatic-unsaved" | "unsaved" | "saved";

const STATUS: Record<CutState, string> = {
  automatic: "Automatic cuts",
  "automatic-unsaved": "Automatic cuts · not saved: your saved cuts come back next time",
  unsaved: "Your cuts · not saved: forgotten when you close the board",
  saved: "Your cuts · saved in this browser",
};

interface Props {
  pages: readonly Page[];
  current: number;
  camera: Camera;
  /** False for boards whose frames are the pages: those can't be cut by hand. */
  editable: boolean;
  state: CutState;
  onCuts: (cuts: readonly number[]) => void;
  onSave: () => void;
  onAutomatic: () => void;
  onPick: (index: number) => void;
  /** Zoom out to every page at once. */
  onShowAll: () => void;
  onClose: () => void;
}

/**
 * The whole board at once, with a line at every page cut. Drag a line to move
 * the cut, double-click to add or remove one. The board is drawn by
 * Excalidraw underneath; this layer only draws the pages and cuts over it.
 */
export function CutOverview({ pages, current, camera, editable, state, onCuts, onSave, onAutomatic, onPick, onShowAll, onClose }: Props) {
  const cuts = cutsOf(pages);
  const top = pages[0].y0;
  const bottom = pages[pages.length - 1].y1;
  const left = Math.min(...pages.map((p) => p.x0));
  const right = Math.max(...pages.map((p) => p.x1));

  // The cut being dragged, followed on screen and handed over on release.
  const [drag, setDrag] = useState<{ index: number; cuts: readonly number[] } | null>(null);
  const shown = drag?.cuts ?? cuts;
  const sceneY = (e: React.PointerEvent | React.MouseEvent) => pointToScene(camera, { x: e.clientX, y: e.clientY }).y;
  const span = toScreen(camera, { x0: left, x1: right, y0: top, y1: bottom });

  return (
    <div
      className={styles.layer}
      role="dialog"
      aria-label="Whole board"
      onDoubleClick={(e) => {
        const p = pointToScene(camera, { x: e.clientX, y: e.clientY });
        if (editable && p.x >= left && p.x <= right) onCuts(addCut(cuts, p.y, top, bottom));
      }}
    >
      {pages.map((page, i) => {
        const b = toScreen(camera, page);
        return (
          <div
            key={i}
            className={styles.page}
            data-current={i === current}
            style={{ left: b.x0, top: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 }}
          >
            <button className={styles.number} onClick={() => onPick(i)} title={`Go to page ${i + 1}`}>
              {i + 1}
            </button>
          </div>
        );
      })}

      {editable &&
        shown.map((y, i) => (
          <div
            key={i}
            className={styles.cut}
            data-dragging={drag?.index === i}
            style={{ left: span.x0, width: span.x1 - span.x0, top: (y + camera.scrollY) * camera.zoom }}
            title="Drag to move this cut · double-click to remove it"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ index: i, cuts });
            }}
            onPointerMove={(e) => drag && setDrag({ index: i, cuts: moveCut(cuts, i, sceneY(e), top, bottom) })}
            onPointerUp={() => {
              if (drag) onCuts(drag.cuts);
              setDrag(null);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onCuts(cuts.filter((_, j) => j !== i));
            }}
          />
        ))}

      <div
        className={styles.toolbar}
        // Clicking a button mustn't take focus from the slideshow keys.
        onMouseDown={(e) => e.preventDefault()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <span className={styles.status}>{editable ? STATUS[state] : "This board uses its frames as pages"}</span>
        {editable && (
          <>
            <button className={styles.button} onClick={onSave} disabled={state === "automatic" || state === "saved"}>
              Save
            </button>
            <button
              className={styles.button}
              onClick={onAutomatic}
              disabled={state === "automatic" || state === "automatic-unsaved"}
              title="Go back to the cuts found automatically"
            >
              Automatic
            </button>
          </>
        )}
        <button className={styles.button} onClick={onShowAll}>
          Show all
        </button>
        <button className={styles.button} data-primary onClick={onClose} title="Done (W or Esc)">
          Done
        </button>
      </div>
      {editable && (
        <div className={styles.hint}>
          Drag a line to move a cut · double-click to add or remove one · scroll to move, Ctrl+scroll to zoom
        </div>
      )}
    </div>
  );
}
