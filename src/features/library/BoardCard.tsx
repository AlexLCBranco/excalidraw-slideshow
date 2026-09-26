import { useRef } from "react";

import type { BoardEntry } from "../../lib/library";
import { loadLastPage } from "../../lib/storage";
import styles from "./BoardCard.module.css";
import { displayName, formatAgo, formatSize } from "./format";
import { useBoardThumbnail } from "./useBoardThumbnail";

/** One board in the library: its first page, name and details. Click to present it. */
export function BoardCard({ entry, onOpen }: { entry: BoardEntry; onOpen: (entry: BoardEntry) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const thumb = useBoardThumbnail(entry, ref);
  const drawn = typeof thumb === "object" ? thumb : null;
  const lastPage = loadLastPage(entry.name);

  return (
    <button ref={ref} className={styles.card} onClick={() => onOpen(entry)}>
      <span className={styles.picture} data-loading={thumb === null}>
        {drawn && <img src={drawn.url} alt="" />}
        {thumb === "failed" && <span className={styles.noPreview}>No preview</span>}
        {lastPage > 0 && <span className={styles.resume}>Resume p.{lastPage + 1}</span>}
      </span>
      <span className={styles.body}>
        <span className={styles.name}>{displayName(entry.name)}</span>
        <span className={styles.meta}>
          {drawn && `${drawn.pageCount} pages · `}
          {formatSize(entry.size)} · edited {formatAgo(entry.lastModified)}
        </span>
        {entry.folder && <span className={styles.folder}>{entry.folder}</span>}
      </span>
    </button>
  );
}
