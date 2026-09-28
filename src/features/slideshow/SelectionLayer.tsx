import { useEffect, useMemo, useRef, useState } from "react";

import { type Camera, elementBounds } from "../../domain/pages";
import {
  type Box,
  boxAround,
  elementAt,
  elementsInBox,
  elementsInLasso,
  extendSelection,
  type Point,
  pointToScene,
  toScene,
  toScreen,
} from "../../domain/selection";
import type { SceneElement } from "../../domain/types";
import styles from "./SelectionLayer.module.css";

/** A drag shorter than this, in px, is a click: it picks the element under the mouse. */
const CLICK_PX = 4;
const isClick = (b: Box) => b.x1 - b.x0 < CLICK_PX && b.y1 - b.y0 < CLICK_PX;
/** A lasso gets a new point once the mouse has moved this far, in px, which keeps the loop light. */
const LOOP_STEP_PX = 3;

interface Drag {
  start: Point;
  end: Point;
  /** The lasso's points (Alt held at the start), or null for a box. */
  loop: Point[] | null;
  /** Shift held at the start: add to the selection instead of replacing it. */
  shift: boolean;
}

/** What a drag picks on its own, before Shift is taken into account. A tiny drag is a click. */
function pick(d: Drag, elements: readonly SceneElement[], camera: Camera) {
  const area = boxAround(d.loop ?? [d.start, d.end]);
  if (isClick(area)) {
    const p = pointToScene(camera, d.end);
    return { click: true, picked: elementAt(elements, p.x, p.y) };
  }
  const picked = d.loop
    ? elementsInLasso(elements, d.loop.map((p) => pointToScene(camera, p)))
    : elementsInBox(elements, toScene(camera, area));
  return { click: false, picked };
}

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
  /** The page on screen, in scene coordinates: Ctrl+A selects what lies inside it. */
  page: Box;
}

/**
 * The select tool. Sits over the canvas, so dragging draws a selection box
 * instead of panning (Alt+drag draws a lasso), and a click picks one element.
 * Shift adds to the selection and Ctrl+A takes the whole page. Selected
 * elements are outlined, with their actions just above them.
 */
export function SelectionLayer({ elements, camera, selected, onSelect, actions, opacity, onOpacity, page }: Props) {
  const [drag, setDrag] = useState<Drag | null>(null);

  // Ctrl+A selects the page and Ctrl+C runs the copy action, as on excalidraw.com.
  const latest = useRef({ elements, selected, onSelect, actions, page });
  useEffect(() => {
    latest.current = { elements, selected, onSelect, actions, page };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const { elements, selected, onSelect, actions, page } = latest.current;
      const key = e.key.toLowerCase();
      const copy = actions.find((a) => a.shortcut === "Ctrl+C");
      if (key === "a") {
        e.preventDefault();
        onSelect(elementsInBox(elements, page));
      } else if (key === "c" && selected.length && copy) {
        e.preventDefault();
        copy.run(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    setDrag({ start: p, end: p, loop: e.altKey ? [p] : null, shift: e.shiftKey });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = { x: e.clientX, y: e.clientY };
    const last = drag.loop?.at(-1);
    const loop = last && Math.hypot(p.x - last.x, p.y - last.y) >= LOOP_STEP_PX ? [...drag.loop!, p] : drag.loop;
    setDrag({ ...drag, end: p, loop });
  };

  const onUp = () => {
    if (!drag) return;
    setDrag(null);
    const { click, picked } = pick(drag, elements, camera);
    onSelect(extendSelection(elements, selected, picked, { shift: drag.shift, click }));
  };

  // While dragging, what the box or lasso would pick is outlined live, as on excalidraw.com.
  const picking = useMemo(() => {
    if (!drag) return null;
    const { click, picked } = pick(drag, elements, camera);
    return extendSelection(elements, selected, click ? [] : picked, { shift: drag.shift, click: false });
  }, [drag, elements, camera, selected]);

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
        {drag?.loop && <path className={styles.box} d={`M${drag.loop.map((p) => `${p.x},${p.y}`).join("L")}Z`} />}
        {drag && !drag.loop && (
          <rect
            className={styles.box}
            x={Math.min(drag.start.x, drag.end.x)}
            y={Math.min(drag.start.y, drag.end.y)}
            width={Math.abs(drag.end.x - drag.start.x)}
            height={Math.abs(drag.end.y - drag.start.y)}
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
