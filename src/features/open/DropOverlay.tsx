import styles from "./DropOverlay.module.css";

interface Props {
  /** Files are being dragged over the window. */
  dragging: boolean;
  /** What became of the last drop, when there's something to say ("Can't open .pdf files"). */
  note: string | null;
}

/**
 * Covers the whole window while files are dragged over it, on either screen.
 * It never takes the mouse, so the drag's events still reach the page below
 * (and `useWindowFileDrop`).
 */
export function DropOverlay({ dragging, note }: Props) {
  return (
    <>
      {dragging && (
        <div className={styles.overlay} data-testid="drop-overlay">
          <span className={styles.label}>Drop to open</span>
        </div>
      )}
      <p className={styles.note} role="status" data-visible={note !== null}>
        {note}
      </p>
    </>
  );
}
