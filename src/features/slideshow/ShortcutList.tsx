import styles from "./ShortcutList.module.css";

const SHORTCUTS: [keys: string[], action: string][] = [
  [["←", "→"], "previous / next page"],
  [["Home", "End"], "first / last page"],
  [["12", "Enter"], "go to page 12"],
  [["G"], "all pages"],
  [["F"], "full screen"],
  [["H"], "hide / show the control bar"],
  [["K"], "laser pointer"],
  [["V"], "select / hand (select: drag a box, Ctrl+C copies)"],
  [["Alt", "drag"], "lasso: draw a loop around what to select"],
  [["Shift", "drag"], "add to the selection (Shift+click adds or removes one)"],
  [["-", "="], "smaller / bigger pages (boards without frames)"],
  [["O"], "open another board"],
  [["?"], "these shortcuts"],
  [["Esc"], "close / back"],
];

/** The keyboard and mouse shortcuts, shown on the open screen and in the help overlay. */
export function ShortcutList() {
  return (
    <dl className={styles.keys}>
      {SHORTCUTS.map(([keys, action]) => (
        <div key={action} className={styles.row}>
          <dt>
            {keys.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
          </dt>
          <dd>{action}</dd>
        </div>
      ))}
    </dl>
  );
}
