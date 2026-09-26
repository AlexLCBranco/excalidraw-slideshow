import { useEffect, useRef } from "react";

import type { Page } from "../../domain/types";
import styles from "./PageGrid.module.css";

interface Props {
  pages: readonly Page[];
  thumbnails: readonly (string | undefined)[];
  current: number;
  onPick: (index: number) => void;
}

/** Every page at a glance. Click one to jump there; ←/→ still move the highlight. */
export function PageGrid({ pages, thumbnails, current, onPick }: Props) {
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [current]);

  return (
    <div className={styles.overlay} role="dialog" aria-label="All pages">
      <ol className={styles.grid}>
        {pages.map((page, i) => (
          <li key={i}>
            <button
              ref={i === current ? currentRef : undefined}
              className={styles.page}
              data-current={i === current}
              onClick={() => onPick(i)}
            >
              <span className={styles.frame} style={{ aspectRatio: `${page.x1 - page.x0} / ${page.y1 - page.y0}` }}>
                {thumbnails[i] && <img src={thumbnails[i]} alt="" />}
              </span>
              <span className={styles.label}>
                <span className={styles.number}>{i + 1}</span>
                {page.name}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
