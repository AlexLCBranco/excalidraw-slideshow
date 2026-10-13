import { useEffect, useMemo, useRef, useState } from "react";

import { type Addition, newId, placeImage, removeAddition, replaceAddition, textSizeFor } from "../../domain/additions";
import type { Board } from "../../domain/scene";
import type { Page } from "../../domain/types";
import { additionScene, readImage } from "../../lib/additions";
import { loadAdditions, saveAdditions } from "../../lib/storage";
import type { Confirm } from "./ConfirmDialog";
import { isTyping } from "./useSlideKeys";

/**
 * Text and pictures added on top of the board. Like every change made while
 * viewing, they last until the board is closed unless saved, and then only in
 * this browser: the file is never changed. Saving, discarding, removing one
 * and leaving with unsaved ones all ask first, through `ask`.
 */
export function useAdditions(board: Board, page: Page, showToast: (text: string) => void, ask: (confirm: Confirm) => void) {
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [savedAdditions, setSavedAdditions] = useState<Addition[]>(additions);
  const unsaved = additions !== savedAdditions;
  useEffect(() => {
    let cancelled = false;
    void loadAdditions(board.name).then((saved) => {
      if (cancelled) return;
      // Anything added while they were loading is kept, on top of the saved ones.
      setAdditions((cur) => (cur.length ? [...saved, ...cur] : saved));
      setSavedAdditions(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [board.name]);
  const added = useMemo(() => additionScene(additions), [additions]);
  // The board as shown: its own drawing with the additions on top, for selecting, copying and the page grid.
  const shown = useMemo<Board>(
    () =>
      additions.length
        ? { ...board, elements: [...board.elements, ...added.elements], files: { ...board.files, ...added.files } }
        : board,
    [board, added, additions.length],
  );

  const addText = (at: { x: number; y: number }, text: string) =>
    setAdditions((cur) => [...cur, { kind: "text", id: newId(), x: at.x, y: at.y, text, fontSize: textSizeFor(page) }]);

  // Pictures go in the middle of the page, shrunk to fit; drag one to move it, its corner to resize it.
  const addImages = async (files: readonly File[]) => {
    for (const file of files.filter((f) => f.type.startsWith("image/"))) {
      try {
        const { dataURL, mimeType, width, height } = await readImage(file);
        const box = placeImage(page, width, height);
        const image: Addition = {
          kind: "image",
          id: newId(),
          x: box.x0,
          y: box.y0,
          width: box.x1 - box.x0,
          height: box.y1 - box.y0,
          dataURL,
          mimeType,
        };
        setAdditions((cur) => [...cur, image]);
      } catch {
        showToast(`Couldn't read ${file.name} as a picture`);
      }
    }
  };

  // A picture pasted with Ctrl+V is added too. Nothing pasted reaches Excalidraw, which would put it in the board.
  const latestAddImages = useRef(addImages);
  useEffect(() => {
    latestAddImages.current = addImages;
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.some((f) => f.type.startsWith("image/"))) void latestAddImages.current(files);
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, []);

  const remove = (id: string) =>
    ask({
      question: `Remove this added ${additions.find((a) => a.id === id)?.kind === "image" ? "picture" : "text"}?`,
      detail: savedAdditions.some((a) => a.id === id) ? "It stays saved until you press Save changes." : undefined,
      choices: [{ label: "Remove", danger: true, run: () => setAdditions((cur) => removeAddition(cur, id)) }],
    });

  /** Stores the additions in this browser. Resolves to whether that worked. */
  const persist = async () => {
    const ok = await saveAdditions(board.name, additions);
    if (ok) setSavedAdditions(additions);
    showToast(ok ? "Saved in this browser · the board file is unchanged" : "Couldn't save: the browser's storage is unavailable or full");
    return ok;
  };

  const askSave = () =>
    ask({
      question: "Save your changes?",
      detail: "What you added will show every time you open this board in this browser. The board file itself is never changed.",
      choices: [{ label: "Save changes", run: () => void persist() }],
    });

  const askDiscard = () =>
    ask({
      question: "Discard your changes?",
      detail: "Everything added or removed since the last save is undone.",
      choices: [{ label: "Discard", danger: true, run: () => setAdditions(savedAdditions) }],
    });

  /** Leaving the board with unsaved additions asks first. */
  const guardLeave = (go: () => void) => () => {
    if (!unsaved) return go();
    ask({
      question: "Save your changes before leaving?",
      detail: "Unsaved additions are lost when you leave the board.",
      choices: [
        { label: "Don't save", danger: true, run: go },
        { label: "Save changes", run: () => void persist().then((ok) => ok && go()) },
      ],
    });
  };

  // Closing the tab or window with unsaved additions gets the browser's own "Leave site?".
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  return {
    additions,
    /** The additions as Excalidraw elements and files. */
    added,
    shown,
    unsaved,
    addText,
    addImages,
    /** An addition moved or resized. */
    change: (next: Addition) => setAdditions((cur) => replaceAddition(cur, next)),
    remove,
    askSave,
    askDiscard,
    guardLeave,
  };
}
