import { useRef } from "react";

import { type Addition, cornerScale, moved, scaled } from "../../domain/additions";
import { type Camera, elementBounds } from "../../domain/pages";
import { type Box, pointToScene, toScreen } from "../../domain/selection";
import type { SceneElement } from "../../domain/types";
import styles from "./AddedLayer.module.css";

interface Props {
  additions: readonly Addition[];
  /** The same additions as drawn in the scene, for their size. */
  elements: readonly SceneElement[];
  camera: Camera;
  /** Whether the additions themselves take the mouse (moving them by any part), or only their tags and handles. */
  grab: boolean;
  onChange: (next: Addition) => void;
  onRemove: (id: string) => void;
}

/** A move or resize in progress: what it started from, so every step is measured from there and nothing drifts. */
interface Drag {
  mode: "move" | "resize";
  from: Addition;
  /** Where the pointer went down, in scene units. */
  start: { x: number; y: number };
  /** The addition's bounds when the drag started, in scene units. */
  box: Box;
}

/**
 * Marks everything added on top of the board, so it can't be mistaken for the
 * board's own drawing: a dashed outline and an "Added" tag. Drag an addition
 * (or its tag) to move it, its corner handle to resize it, × to remove it.
 */
export function AddedLayer({ additions, elements, camera, grab, onChange, onRemove }: Props) {
  const drag = useRef<Drag | null>(null);
  const scene = (e: React.PointerEvent) => pointToScene(camera, { x: e.clientX, y: e.clientY });

  return (
    <div className={styles.layer}>
      {elements.map((e) => {
        const b = elementBounds(e);
        const addition = additions.find((a) => a.id === e.id);
        if (!b || !addition) return null;
        const s = toScreen(camera, b);
        const begin = (mode: Drag["mode"]) => (ev: React.PointerEvent) => {
          ev.stopPropagation();
          ev.currentTarget.setPointerCapture(ev.pointerId);
          drag.current = { mode, from: addition, start: scene(ev), box: b };
        };
        const follow = (ev: React.PointerEvent) => {
          const d = drag.current;
          if (!d || d.from.id !== e.id) return;
          const p = scene(ev);
          onChange(
            d.mode === "move"
              ? moved(d.from, p.x - d.start.x, p.y - d.start.y)
              : scaled(d.from, cornerScale(d.box, p.x, p.y)),
          );
        };
        const end = () => (drag.current = null);
        const handlers = { onPointerMove: follow, onPointerUp: end, onPointerCancel: end };
        return (
          <div
            key={e.id}
            className={styles.outline}
            data-testid="added"
            data-grab={grab}
            style={{ left: s.x0, top: s.y0, width: s.x1 - s.x0, height: s.y1 - s.y0 }}
            title={grab ? "Added in this app · drag to move, drag the corner to resize" : undefined}
            // Keep focus off it, so the arrow keys stay slideshow keys.
            onMouseDown={(ev) => ev.preventDefault()}
            onPointerDown={grab ? begin("move") : undefined}
            {...handlers}
          >
            <div
              className={styles.tag}
              title="Added in this app, not part of the board · drag to move"
              onPointerDown={begin("move")}
              {...handlers}
            >
              Added
              <button
                className={styles.remove}
                aria-label="Remove"
                title="Remove"
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={() => onRemove(e.id)}
              >
                ×
              </button>
            </div>
            <div
              className={styles.handle}
              data-testid="resize"
              title="Drag to resize"
              onPointerDown={begin("resize")}
              {...handlers}
            />
          </div>
        );
      })}
    </div>
  );
}
