import { useEffect, useState } from "react";

import styles from "./OpenScreen.module.css";

interface Props {
  status: string;
  busy: boolean;
  lastFileName: string | null;
  onPick: () => void;
  onReopen: () => void;
  onDropFile: (file: File) => void;
}

/** The start screen: open a board, reopen the last one, or drop a file anywhere on the window. */
export function OpenScreen({ status, busy, lastFileName, onPick, onReopen, onDropFile }: Props) {
  const dragging = useWindowFileDrop(onDropFile);

  return (
    <div className={`${styles.screen} ${dragging ? styles.dragging : ""}`}>
      <div className={styles.card}>
        <h1 className={styles.title}>Excalidraw Slideshow</h1>
        <p className={styles.status}>{status || "Open a board, or drag a .excalidraw file onto this window."}</p>
        <div className={styles.actions}>
          <button className={styles.primary} onClick={onPick} disabled={busy}>
            Open board…
          </button>
          {lastFileName && (
            <button className={styles.secondary} onClick={onReopen} disabled={busy}>
              Reopen {lastFileName}
            </button>
          )}
        </div>
        <KeyHelp />
      </div>
    </div>
  );
}

function KeyHelp() {
  return (
    <dl className={styles.keys}>
      <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>previous / next page</dd>
      <dt><kbd>Home</kbd> <kbd>End</kbd></dt><dd>first / last page</dd>
      <dt><kbd>O</kbd></dt><dd>open another board</dd>
      <dt><kbd>Esc</kbd></dt><dd>back to this screen</dd>
      <dt><kbd>-</kbd> <kbd>=</kbd></dt><dd>smaller / bigger pages (boards without frames)</dd>
      <dt><kbd>F11</kbd></dt><dd>full screen</dd>
    </dl>
  );
}

function useWindowFileDrop(onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => !e.relatedTarget && setDragging(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) onFile(file);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [onFile]);
  return dragging;
}
