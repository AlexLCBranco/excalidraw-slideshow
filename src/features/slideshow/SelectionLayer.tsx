import { useEffect, useMemo, useRef, useState } from "react";

import { type Camera, elementBounds } from "../../domain/pages";
import { type Box, boxBetween, elementAt, elementsInBox, toScene, toScreen } from "../../domain/selection";
import type { SceneElement } from "../../domain/types";
import styles from "./SelectionLayer.module.css";

/** A drag shorter than this, in px, is a click: it picks the element under the mouse. */
const CLICK_PX = 4;
const isClick = (b: Box) => b.x1 - b.x0 < CLICK_PX && b.y1 - b.y0 < CLICK_PX;

export interface SelectionAction {
  label: string;
  /** Shown in the tooltip, e.g. "Ctrl+C". */
  shortcut?: string;
  run: (selected: SceneElement[]) => void;
}

interface Props {
  elements: readonly SceneElement[];
  camera: Camera;
  selected: SceneElement[];
  onSelect: (selected: SceneElement[]) => void;
  /** What can be done with a selection, shown as buttons above it. */
  actions: readonly SelectionAction[];
  /** The selection's opacity (0 to 100), shown as a slider next to the actions. */
  opacity: number;
  onOpacity: (opacity: number) => void;
}

/**
 * The select tool. Sits over the canvas, so dragging draws a selection box
 * instead of panning, and a click picks one element. Selected elements are
 * outlined, with their actions just above them.
 */
export function SelectionLayer({ elements, camera, selected, onSelect, actions, opacity, onOpacity }: Props) {
  const [drag, setDrag] = useState<{ x: number; y: number; box: Box } | null>(null);

  // Ctrl+C copies, as on excalidraw.com. The first action is the copy.
  const latest = useRef({ selected, actions });
  useEffect(() => {
    latest.current = { selected, actions };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { selected, actions } = latest.current;
      const action = actions.find((a) => a.shortcut === "Ctrl+C");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selected.length && action) {
        e.preventDefault();
        action.run(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, y: e.clientY, box: boxBetween(e.clientX, e.clientY, e.clientX, e.clientY) });
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag) setDrag({ ...drag, box: boxBetween(drag.x, drag.y, e.clientX, e.clientY) });
  };
  const onUp = () => {
    if (!drag) return;
    const { box } = drag;
    setDrag(null);
    if (isClick(box)) {
      const p = toScene(camera, box);
      onSelect(elementAt(elements, p.x0, p.y0));
    } else {
      onSelect(elementsInBox(elements, toScene(camera, box)));
    }
  };

  // While a box is dragged, what it would pick is outlined live, as on excalidraw.com.
  const picking = useMemo(
    () => (drag ? (isClick(drag.box) ? [] : elementsInBox(elements, toScene(camera, drag.box))) : null),
    [drag, elements, camera],
  );

  const outlines = (picking ?? selected).flatMap((e) => {
    const b = elementBounds(e);
    return b ? [toScreen(camera, b)] : [];
  });
  const around = outlines.length
    ? {
        x0: Math.min(...outlines.map((b) => b.x0)),
        y0: Math.min(...outlines.map((b) => b.y0)),
        x1: Math.max(...outlines.map((b) => b.x1)),
      }
    : null;

  return (
    <div className={styles.layer} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
      <svg className={styles.drawing}>
        {outlines.map((b, i) => (
          <rect key={i} className={styles.outline} x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} />
        ))}
        {drag && (
          <rect
            className={styles.box}
            x={drag.box.x0}
            y={drag.box.y0}
            width={drag.box.x1 - drag.box.x0}
            height={drag.box.y1 - drag.box.y0}
          />
        )}
      </svg>

      {around && !drag && (
        <div
          className={styles.actions}
          // Never above the top of the screen: a selection there gets its actions over it instead.
          style={{ left: (around.x0 + around.x1) / 2, top: `max(var(--space-7), ${around.y0}px)` }}
          // Clicking an action mustn't start a new selection, or take focus from the slideshow keys.
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className={styles.count}>{selected.length} selected</span>
          {actions.map((a) => (
            <button
              key={a.label}
              className={styles.action}
              onClick={() => a.run(selected)}
              title={a.shortcut ? `${a.label} (${a.shortcut})` : a.label}
            >
              {a.label}
            </button>
          ))}
          <label className={styles.opacity} title="Opacity, only while presenting: the board is never changed">
            Opacity
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => onOpacity(Number(e.target.value))}
              // The slider needs the mouse down to drag; the arrow keys still page, as they're caught first.
              onMouseDown={(e) => e.stopPropagation()}
            />
          </label>
        </div>
      )}
    </div>
  );
}
