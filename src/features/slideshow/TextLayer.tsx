import { useState } from "react";

import type { Camera } from "../../domain/pages";
import { type Point, pointToScene } from "../../domain/selection";
import styles from "./TextLayer.module.css";

interface Props {
  camera: Camera;
  /** How tall the text is, in scene units. */
  fontSize: number;
  /** Called with where the text starts (scene) and what was typed. Empty text adds nothing. */
  onAdd: (at: Point, text: string) => void;
  onCancel: () => void;
}

/**
 * The text tool: click on the page, type, then Enter (Shift+Enter for a new
 * line) or click elsewhere to add it. Esc lets it go.
 */
export function TextLayer({ camera, fontSize, onAdd, onCancel }: Props) {
  const [at, setAt] = useState<Point | null>(null);
  const [text, setText] = useState("");

  const finish = () => {
    if (!at) return;
    if (text.trim()) onAdd(pointToScene(camera, at), text.replace(/\s+$/, ""));
    else onCancel();
  };

  return (
    <div
      className={styles.layer}
      data-testid="text-layer"
      // The click would otherwise take focus straight back from the text box it opens.
      onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        // Clicking away from a text being typed finishes it, as on excalidraw.com.
        if (at) finish();
        else setAt({ x: e.clientX, y: e.clientY });
      }}
    >
      {at && (
        <textarea
          className={styles.box}
          autoFocus
          rows={Math.max(1, text.split("\n").length)}
          style={{ left: at.x, top: at.y, fontSize: fontSize * camera.zoom }}
          value={text}
          placeholder="Type, then Enter"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              finish();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
        />
      )}
    </div>
  );
}
