import { useEffect, useState } from "react";

import type { Board } from "../../domain/scene";
import type { Page } from "../../domain/types";
import { renderPage } from "../../lib/render";

const THUMB_SIZE = 480;

/**
 * Picture URLs for every page, drawn one at a time the first time `enabled`
 * turns on (so big boards cost nothing until the page grid is opened).
 * Missing entries are still being drawn.
 */
export function usePageThumbnails(board: Board, pages: readonly Page[], enabled: boolean) {
  // Tagged with the pages they were drawn for, so a page-height change drops them.
  const [drawn, setDrawn] = useState<{ pages: readonly Page[]; urls: (string | undefined)[] }>({ pages, urls: [] });
  const [started, setStarted] = useState(false);
  if (enabled && !started) setStarted(true);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    const made: string[] = [];
    void (async () => {
      for (let i = 0; i < pages.length && !cancelled; i++) {
        const blob = await renderPage(board, pages[i], THUMB_SIZE).catch(() => null);
        if (cancelled || !blob) continue;
        const url = URL.createObjectURL(blob);
        made.push(url);
        setDrawn((prev) => ({ pages, urls: Object.assign(prev.pages === pages ? [...prev.urls] : [], { [i]: url }) }));
      }
    })();
    return () => {
      cancelled = true;
      made.forEach(URL.revokeObjectURL);
    };
  }, [board, pages, started]);

  return drawn.pages === pages ? drawn.urls : [];
}
