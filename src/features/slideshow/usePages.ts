import { useMemo, useState } from "react";

import { canCut, pagesFromCuts } from "../../domain/cuts";
import { boardPages, DEFAULT_PAGE_HEIGHT } from "../../domain/pages";
import type { Board } from "../../domain/scene";
import type { Page } from "../../domain/types";
import { loadCuts, loadPageHeight, saveCuts, savePageHeight } from "../../lib/storage";
import type { CutState } from "./CutOverview";

/** Each - or = makes pages this much smaller or bigger. */
const RESIZE_STEP = 1.1;

/**
 * A board's pages: found automatically at a page height (- and = change it,
 * remembered), or cut by hand in the whole-board view (W, kept only when saved).
 * Whenever the pages are about to change, `keepSpot` gets the new ones, so the
 * caller can keep the same part of the board on screen.
 */
export function usePages(board: Board, showToast: (text: string) => void, keepSpot: (next: readonly Page[]) => void) {
  const [pageHeight, setPageHeight] = useState(() => loadPageHeight(board.name) ?? DEFAULT_PAGE_HEIGHT);
  const autoPages = useMemo(() => boardPages(board, pageHeight), [board, pageHeight]);
  // Cuts moved by hand in the whole-board view (W). Like every change made while viewing,
  // they last until the board is closed, unless saved: then they're remembered in this browser.
  const [cuts, setCuts] = useState<readonly number[] | null>(() => loadCuts(board.name));
  const [savedCuts, setSavedCuts] = useState(cuts);
  // A workbook's pages follow its rows and pictures (domain/sheetPages.ts), not cuts.
  const cuttable = !board.pages && canCut(autoPages);
  const pages = useMemo(
    () => (cuts && cuttable ? pagesFromCuts(autoPages, cuts) : autoPages),
    [autoPages, cuts, cuttable],
  );
  const cutsSaved = JSON.stringify(cuts) === JSON.stringify(savedCuts);
  const cutState: CutState = cuts ? (cutsSaved ? "saved" : "unsaved") : cutsSaved ? "automatic" : "automatic-unsaved";

  const changeCuts = (next: readonly number[] | null) => {
    keepSpot(next ? pagesFromCuts(autoPages, next) : autoPages);
    setCuts(next);
  };

  const saveCutsNow = () => {
    saveCuts(board.name, cuts);
    setSavedCuts(cuts);
  };

  const resizePages = (factor: number) => {
    if (board.pages) {
      showToast("A workbook's pages follow its rows and pictures");
      return;
    }
    if (cuts && cuttable) {
      showToast("This board's pages are cut by hand · W to change them");
      return;
    }
    const next = Math.round(pageHeight * factor);
    const nextPages = boardPages(board, next);
    if (nextPages.every((p) => p.frameId)) {
      showToast("This board uses its frames as pages");
      return;
    }
    keepSpot(nextPages);
    setPageHeight(next);
    savePageHeight(board.name, next);
    showToast(`${nextPages.length} pages`);
  };

  return {
    pages,
    cuttable,
    cutState,
    changeCuts,
    saveCuts: saveCutsNow,
    smaller: () => resizePages(1 / RESIZE_STEP),
    bigger: () => resizePages(RESIZE_STEP),
  };
}
