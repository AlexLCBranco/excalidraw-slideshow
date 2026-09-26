import { useEffect, useState } from "react";

import type { Picked } from "./pickBoard";

/**
 * Lets a board be dropped anywhere on the window. Hands over a file handle
 * where the browser offers one (so the board can join the library), else the file.
 * Returns whether something is being dragged over the window.
 */
export function useWindowFileDrop(onDrop: (picked: Picked) => void) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => !e.relatedTarget && setDragging(false);
    const drop = async (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const item = e.dataTransfer?.items[0];
      const file = e.dataTransfer?.files[0];
      // Must be asked for before the first await: the drop data expires after this event.
      const handle = item?.getAsFileSystemHandle?.();
      const h = await handle?.catch(() => null);
      if (h?.kind === "file") onDrop(h as FileSystemFileHandle);
      else if (file) onDrop(file);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [onDrop]);
  return dragging;
}
