import { useRef } from "react";

import type { Group } from "../../lib/groups";
import type { BoardEntry } from "../../lib/library";
import { loadLastPage } from "../../lib/storage";
import cardStyles from "./BoardCard.module.css";
import styles from "./GroupCard.module.css";
import { useBoardThumbnail } from "./useBoardThumbnail";

interface Props {
  group: Group;
  onOpen: (group: Group) => void;
  onEdit: (group: Group) => void;
  onRemove: (group: Group) => void;
}

/** A group of boards in the library, drawn as a small stack. Click to present them back to back. */
export function GroupCard({ group, onOpen, onEdit, onRemove }: Props) {
  const lastPage = loadLastPage(group.name);
  const count = group.entries.length;
  const details = [
    `${count} ${count === 1 ? "board" : "boards"}`,
    group.missing > 0 && `${group.missing} missing`,
  ].filter(Boolean);

  return (
    <div className={styles.group}>
      <button className={`${cardStyles.card} ${styles.card}`} onClick={() => onOpen(group)} disabled={count === 0}>
        {group.entries[0] ? (
          <Cover entry={group.entries[0]} />
        ) : (
          <span className={cardStyles.picture}>
            <span className={cardStyles.noPreview}>No boards found</span>
          </span>
        )}
        {lastPage > 0 && <span className={cardStyles.resume}>Resume p.{lastPage + 1}</span>}
        <span className={cardStyles.body}>
          <span className={cardStyles.name}>{group.name}</span>
          <span className={cardStyles.meta}>{details.join(" · ")}</span>
          <span className={cardStyles.folder}>{group.picked ? "Your group" : `Folder: ${group.id}`}</span>
        </span>
      </button>
      {group.picked && (
        <div className={styles.actions}>
          <button onClick={() => onEdit(group)}>Edit</button>
          <button
            onClick={() => confirm(`Delete the group “${group.name}”? Its boards stay where they are.`) && onRemove(group)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/** The first board's picture, drawn once it scrolls into view. */
function Cover({ entry }: { entry: BoardEntry }) {
  const ref = useRef<HTMLSpanElement>(null);
  const thumb = useBoardThumbnail(entry, ref);
  return (
    <span ref={ref} className={cardStyles.picture} data-loading={thumb === null}>
      {typeof thumb === "object" && thumb && <img src={thumb.url} alt="" />}
      {thumb === "failed" && <span className={cardStyles.noPreview}>No preview</span>}
    </span>
  );
}
