import { useRef } from "react";

import { type Camera, elementBounds } from "../../domain/pages";
import { toScreen } from "../../domain/selection";
import type { SceneElement } from "../../domain/types";
import styles from "./AddedLayer.module.css";

interface Props {
  /** The added elements, as drawn in the scene. */
  elements: readonly SceneElement[];
  camera: Camera;
  /** Moves an addition by this much, in scene units. */
  onMove: (id: string, dx: number, dy: number) => void;
  onRemove: (id: string) => void;
}

/**
 * Marks everything added on top of the board, so it can't be mistaken for the
 * board's own drawing: a dashed outline and an "Added" tag. Drag the tag to
 * move it, × to remove it. Only the tags take the mouse.
 */
export function AddedLayer({ elements, camera, onMove, onRemove }: Props) {
  // Where the pointer was last, so each move hands over only the distance since.
  const last = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className={styles.layer}>
      {elements.map((e) => {
        const b = elementBounds(e);
        if (!b) return null;
        const s = toScreen(camera, b);
        return (
          <div
            key={e.id}
            className={styles.outline}
            data-testid="added"
            style={{ left: s.x0, top: s.y0, width: s.x1 - s.x0, height: s.y1 - s.y0 }}
          >
            <div
              className={styles.tag}
              title="Added in this app, not part of the board · drag to move"
              // Keep focus off the tag, so the arrow keys stay slideshow keys.
              onMouseDown={(ev) => ev.preventDefault()}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                ev.currentTarget.setPointerCapture(ev.pointerId);
                last.current = { x: ev.clientX, y: ev.clientY };
              }}
              onPointerMove={(ev) => {
                if (!last.current) return;
                onMove(e.id, (ev.clientX - last.current.x) / camera.zoom, (ev.clientY - last.current.y) / camera.zoom);
                last.current = { x: ev.clientX, y: ev.clientY };
              }}
              onPointerUp={() => (last.current = null)}
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
          </div>
        );
      })}
    </div>
  );
}
