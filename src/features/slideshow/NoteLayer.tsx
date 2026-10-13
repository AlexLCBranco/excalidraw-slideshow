import { useEffect, useState } from "react";

import { type BoardNote, noteAt } from "../../domain/notes";
import type { Camera } from "../../domain/pages";
import styles from "./NoteLayer.module.css";

interface Props {
  /** The notes on the page being shown. */
  notes: readonly BoardNote[];
  /** Where the camera is right now (after any drag with the hand). */
  camera: () => Camera;
}

/**
 * Shows a cell's note while the mouse is over the cell, as Excel does. It
 * only listens to where the mouse is, and never takes the mouse's clicks or
 * drags, so selecting, the laser and the hand work over notes as anywhere else.
 */
export function NoteLayer({ notes, camera }: Props) {
  const [hovered, setHovered] = useState<{ note: BoardNote; camera: Camera } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // Not while dragging: a drag is selecting or panning, not reading.
      if (e.buttons) return setHovered(null);
      // Screen to scene: Excalidraw draws scene point p at screen (p + scroll) * zoom.
      const c = camera();
      const note = noteAt(notes, e.clientX / c.zoom - c.scrollX, e.clientY / c.zoom - c.scrollY);
      setHovered(note ? { note, camera: c } : null);
    };
    const onLeave = () => setHovered(null);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [notes, camera]);

  if (!hovered) return null;
  const { note, camera: c } = hovered;
  const right = (note.x1 + c.scrollX) * c.zoom;
  const left = (note.x0 + c.scrollX) * c.zoom;
  const top = (note.y0 + c.scrollY) * c.zoom;
  // Beside the cell on the right, like Excel; on its left when the screen runs out.
  const onLeft = right > window.innerWidth / 2;
  return (
    <div
      className={styles.note}
      role="note"
      style={onLeft ? { right: window.innerWidth - left, top } : { left: right, top }}
    >
      {note.text}
    </div>
  );
}
