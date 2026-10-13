import { fileKind } from "../domain/drop";
import { type Board, parseBoard } from "../domain/scene";
import type { XlsxReply } from "./xlsx.worker";

/** Files the library lists and the app presents: Excalidraw boards and Excel workbooks. */
export const isBoardFile = (fileName: string) => fileKind(fileName) !== null;
export const isSpreadsheet = (fileName: string) => fileKind(fileName) === "workbook";

/** Reads a board or a workbook as a board. Returns an error message for anything else. */
export async function readBoardFile(file: File): Promise<Board | string> {
  if (isSpreadsheet(file.name)) return readSpreadsheet(file);
  return parseBoard(file.name, await file.text());
}

/** Parses a workbook in a worker of its own, so the page stays responsive meanwhile. */
async function readSpreadsheet(file: File): Promise<Board | string> {
  const data = await file.arrayBuffer();
  const worker = new Worker(new URL("./xlsx.worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<Board | string>((resolve) => {
      worker.onmessage = (e: MessageEvent<XlsxReply>) => resolve("board" in e.data ? e.data.board : e.data.error);
      worker.onerror = () => resolve(`Couldn't read ${file.name}.`);
      worker.postMessage({ name: file.name, data }, [data]);
    });
  } finally {
    worker.terminate();
  }
}
