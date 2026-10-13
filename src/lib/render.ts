import { exportToBlob, exportToCanvas } from "@excalidraw/excalidraw";
import type { ExcalidrawFrameLikeElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import type { Board } from "../domain/scene";
import type { Page, SceneElement } from "../domain/types";

/** Pictures of a selection are drawn at twice the scene size, for sharpness, but never wider or taller than this. */
const PICTURE_SCALE = 2;
const PICTURE_MAX_PX = 4096;
const PICTURE_PADDING = 16;

/**
 * Draws one page of a board to an image, for thumbnails.
 *
 * Excalidraw's export crops exactly to a frame when given one, so each page is
 * handed over as a frame: the real one for frame pages, an in-memory stand-in
 * for automatically found pages. The board itself is never changed.
 */
export async function renderPage(board: Board, page: Page, maxSize: number): Promise<Blob | null> {
  const frame = {
    id: page.frameId ?? "slideshow-page",
    type: "frame",
    x: page.x0,
    y: page.y0,
    width: page.x1 - page.x0,
    height: page.y1 - page.y0,
    angle: 0,
    name: null,
    isDeleted: false,
  } as unknown as ExcalidrawFrameLikeElement;

  const canvas = await exportToCanvas({
    elements: board.elements.filter((e) => !e.isDeleted) as never,
    files: board.files as BinaryFiles,
    appState: { exportBackground: true, exportWithDarkMode: !board.exactColors, viewBackgroundColor: board.background },
    exportingFrame: frame,
    maxWidthOrHeight: maxSize,
  });
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
}

/** Draws elements to a PNG the way they look on screen (dark, or a workbook's own colours), for pasting into other apps. */
export function renderPicture(elements: readonly SceneElement[], board: Board): Promise<Blob> {
  return exportToBlob({
    elements: elements.filter((e) => !e.isDeleted) as never,
    files: board.files as BinaryFiles,
    appState: { exportBackground: true, exportWithDarkMode: !board.exactColors, viewBackgroundColor: board.background },
    exportPadding: PICTURE_PADDING,
    getDimensions: (width: number, height: number) => {
      const scale = Math.min(PICTURE_SCALE, PICTURE_MAX_PX / Math.max(width, height));
      return { width: width * scale, height: height * scale, scale };
    },
  });
}
