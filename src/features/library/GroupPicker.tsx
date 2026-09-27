import { useEffect } from "react";

import type { SavedGroup } from "../../lib/storage";
import styles from "./GroupPicker.module.css";

interface Props {
  group: SavedGroup;
  onRename: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * The bar shown while putting a group together: the boards are picked by
 * clicking their cards, in the order they'll be presented.
 */
export function GroupPicker({ group, onRename, onSave, onCancel }: Props) {
  const count = group.boardIds.length;
  const canSave = count > 0 && group.name.trim() !== "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <form
      className={styles.bar}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave();
      }}
    >
      <input
        className={styles.name}
        value={group.name}
        onChange={(e) => onRename(e.target.value)}
        placeholder="Group name"
        aria-label="Group name"
        autoFocus
      />
      <span className={styles.hint}>
        {count === 0
          ? "Click boards in the order to present them"
          : `${count} ${count === 1 ? "board" : "boards"} · click again to take one out`}
      </span>
      <div className={styles.buttons}>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={styles.primary} disabled={!canSave}>
          Save group
        </button>
      </div>
    </form>
  );
}
