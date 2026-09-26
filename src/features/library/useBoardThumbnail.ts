import { type RefObject, useEffect, useState } from "react";

import { type BoardEntry, boardThumbnail } from "../../lib/library";

/**
 * The card picture and page count for a board, fetched once the card
 * scrolls into view (so a long library doesn't read every board up front).
 */
export function useBoardThumbnail(entry: BoardEntry, cardRef: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  // null while loading; "failed" when the file isn't a readable board.
  const [thumb, setThumb] = useState<{ url: string; pageCount: number } | "failed" | null>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cardRef]);

  useEffect(() => {
    if (!visible) return;
    let url = "";
    let cancelled = false;
    void boardThumbnail(entry).then((t) => {
      if (cancelled) return;
      if (!t) return setThumb("failed");
      url = URL.createObjectURL(t.image);
      setThumb({ url, pageCount: t.pageCount });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [entry, visible]);

  return thumb;
}
