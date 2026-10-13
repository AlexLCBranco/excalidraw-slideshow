import type { SheetTab } from "../../domain/sheetPages";
import styles from "./SheetTabs.module.css";

interface Props {
  tabs: readonly SheetTab[];
  /** The sheet being shown. */
  current: number;
  onPick: (tab: SheetTab) => void;
}

/** A workbook's sheets, like Excel's tabs: click one to jump to its first page. */
export function SheetTabs({ tabs, current, onPick }: Props) {
  return (
    <nav
      className={styles.tabs}
      aria-label="Sheets"
      // Keep focus off the tabs, so Space and Enter stay slideshow keys.
      onMouseDown={(e) => e.preventDefault()}
    >
      {tabs.map((tab, i) => (
        <button
          key={tab.firstPage}
          className={styles.tab}
          data-active={i === current}
          aria-current={i === current ? "page" : undefined}
          onClick={() => onPick(tab)}
        >
          {tab.name}
        </button>
      ))}
    </nav>
  );
}
