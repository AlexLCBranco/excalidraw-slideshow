import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { FileId } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";

import type { Addition } from "../domain/additions";
import type { SceneElement } from "../domain/types";

/**
 * Turns additions into Excalidraw elements and image files, drawn on top of the
 * board. Each keeps its addition's id, so the scene can swap them out again.
 * Text uses Excalidraw's default colour, which reads on both the dark board
 * theme and a workbook's light one.
 */
export function additionScene(additions: readonly Addition[]) {
  const elements = convertToExcalidrawElements(
    additions.map((a) =>
      a.kind === "text"
        ? { type: "text" as const, id: a.id, x: a.x, y: a.y, text: a.text, fontSize: a.fontSize }
        : { type: "image" as const, id: a.id, x: a.x, y: a.y, width: a.width, height: a.height, fileId: a.id as FileId, status: "saved" as const },
    ),
    { regenerateIds: false },
  ) as unknown as SceneElement[];
  const files: Record<string, BinaryFileData> = {};
  for (const a of additions) {
    if (a.kind === "image") {
      files[a.id] = { id: a.id as FileId, dataURL: a.dataURL as DataURL, mimeType: a.mimeType as BinaryFileData["mimeType"], created: 0 };
    }
  }
  return { elements, files };
}

/** Reads a picture file: its contents as a data: URL and its size in px. */
export async function readImage(file: Blob) {
  const dataURL = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return { dataURL, mimeType: file.type, ...size };
}
