import styles from "./HelpOverlay.module.css";
import { ShortcutList } from "./ShortcutList";

/** The keyboard shortcuts over the slideshow. Any click, `?` or Esc closes it. */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.overlay} role="dialog" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className={styles.card}>
        <h2 className={styles.title}>Keyboard shortcuts</h2>
        <ShortcutList />
      </div>
    </div>
  );
}
