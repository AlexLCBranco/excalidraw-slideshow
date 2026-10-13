import { useEffect, useRef } from "react";

import styles from "./ConfirmDialog.module.css";

export interface Confirm {
  question: string;
  detail?: string;
  /** The choices besides Cancel, last one first in importance (Enter picks it). */
  choices: { label: string; run: () => void; danger?: boolean }[];
}

/** "Are you sure?": Cancel, or one of the choices. Enter picks the last choice, Esc cancels. */
export function ConfirmDialog({ confirm, onDone }: { confirm: Confirm; onDone: () => void }) {
  const latest = useRef({ confirm, onDone });
  useEffect(() => {
    latest.current = { confirm, onDone };
  });

  useEffect(() => {
    // Caught first, so the slideshow keys and Excalidraw never see them while the question is up.
    const onKey = (e: KeyboardEvent) => {
      const { confirm, onDone } = latest.current;
      if (e.key === "Escape") onDone();
      else if (e.key === "Enter") {
        onDone();
        confirm.choices.at(-1)?.run();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className={styles.overlay} onPointerDown={(e) => e.target === e.currentTarget && onDone()}>
      <div className={styles.card} role="alertdialog" aria-modal aria-label={confirm.question}>
        <h2 className={styles.question}>{confirm.question}</h2>
        {confirm.detail && <p className={styles.detail}>{confirm.detail}</p>}
        <div className={styles.buttons} onMouseDown={(e) => e.preventDefault()}>
          <button className={styles.button} onClick={onDone}>
            Cancel
          </button>
          {confirm.choices.map((c, i) => (
            <button
              key={c.label}
              className={styles.button}
              data-primary={i === confirm.choices.length - 1}
              data-danger={c.danger ?? false}
              onClick={() => {
                onDone();
                c.run();
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
