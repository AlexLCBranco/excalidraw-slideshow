import { useEffect, useRef, useState } from "react";

import { type DragSignal, isFileDrag, nextDragDepth } from "../../domain/drop";
import type { Picked } from "./pickBoard";

/** The browser repeats `dragover` every few hundred ms while a drag is over the page; this long without one, it's gone. */
const QUIET_MS = 1000;

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea") !== null);

const carriesFiles = (e: DragEvent) => isFileDrag([...(e.dataTransfer?.types ?? [])]);

/**
 * Lets files be dropped anywhere on the window. Hands them over in the order
 * the browser gives them: as file handles where the browser offers them (so
 * they can join the library), else as plain files. Returns whether files are
 * being dragged over the window, for the drop overlay.
 *
 * Listens in the capture phase on `window`, ahead of everything else on the
 * page, and stops every drag there, so Excalidraw never sees a drop (it would
 * load the file into its scene, or add a dropped picture or link to it) and
 * the browser never opens what was dropped. Text dragged onto a text field is
 * the one thing let through.
 */
export function useWindowFileDrop(onDrop: (dropped: Picked[]) => void) {
  const [depth, setDepth] = useState(0);
  const latest = useRef(onDrop);
  useEffect(() => {
    latest.current = onDrop;
  });

  useEffect(() => {
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const signal = (s: DragSignal) => {
      setDepth((d) => nextDragDepth(d, s));
      clearTimeout(quiet);
      if (s !== "end") quiet = setTimeout(() => signal("end"), QUIET_MS);
    };

    /** Claims the event from the browser and from everything on the page. False for text headed into a text field. */
    const claim = (e: DragEvent) => {
      const files = carriesFiles(e);
      if (!files && isEditable(e.target)) return false;
      e.preventDefault();
      e.stopPropagation();
      // Anything but files gets the "no entry" cursor and never lands.
      if (e.dataTransfer) e.dataTransfer.dropEffect = files ? "copy" : "none";
      return true;
    };

    const enter = (e: DragEvent) => {
      if (claim(e) && carriesFiles(e)) signal("enter");
    };
    const over = (e: DragEvent) => {
      if (claim(e) && carriesFiles(e)) signal("over");
    };
    const leave = (e: DragEvent) => carriesFiles(e) && signal("leave");
    const end = () => signal("end");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && signal("end");

    const drop = async (e: DragEvent) => {
      if (!claim(e)) return;
      signal("end");
      const transfer = e.dataTransfer;
      if (!transfer) return;
      // Everything must be asked for before the first await: the drop data expires with this event.
      const items = [...transfer.items].filter((i) => i.kind === "file");
      const pending = items.length
        ? items.map((i) => ({ file: i.getAsFile(), handle: i.getAsFileSystemHandle?.().catch(() => null) }))
        : [...transfer.files].map((file) => ({ file, handle: undefined }));
      const dropped = await Promise.all(
        pending.map(async ({ file, handle }) => {
          const h = await handle;
          return h?.kind === "file" ? (h as FileSystemFileHandle) : file;
        }),
      );
      latest.current(dropped.filter((d) => d !== null));
    };

    const listeners = [
      ["dragenter", enter],
      ["dragover", over],
      ["dragleave", leave],
      ["dragend", end],
      ["drop", drop],
      ["keydown", esc],
    ] as const;
    for (const [type, fn] of listeners) window.addEventListener(type, fn as EventListener, true);
    return () => {
      clearTimeout(quiet);
      for (const [type, fn] of listeners) window.removeEventListener(type, fn as EventListener, true);
    };
  }, []);

  return depth > 0;
}
