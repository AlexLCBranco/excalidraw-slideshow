import { useCallback, useEffect, useState } from "react";

import { type Board, parseBoard } from "../../domain/scene";
import { loadLastFile, saveLastFile } from "../../lib/storage";

// The File System Access API (Edge and Chrome) isn't in TypeScript's DOM types yet.
declare global {
  interface Window {
    showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>;
  }
  interface FileSystemHandle {
    queryPermission?: (options?: object) => Promise<PermissionState>;
    requestPermission?: (options?: object) => Promise<PermissionState>;
  }
}

const PICKER_OPTIONS = {
  types: [{ description: "Excalidraw board", accept: { "application/json": [".excalidraw", ".json"] } }],
};

/**
 * Opening boards: the file picker, drag-and-drop and "reopen the last board".
 * Returns the open board plus a status line for the open screen.
 */
export function useBoardOpener() {
  const [board, setBoard] = useState<Board | null>(null);
  // Bumped on every open, so reopening the same file still starts a fresh slideshow.
  const [openCount, setOpenCount] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastFile, setLastFile] = useState<FileSystemFileHandle | null>(null);

  useEffect(() => {
    void loadLastFile().then(setLastFile);
  }, []);

  const openFile = useCallback(async (file: File) => {
    setBusy(true);
    setStatus(`Loading ${file.name}…`);
    const result = parseBoard(file.name, await file.text());
    setBusy(false);
    if (typeof result === "string") {
      setStatus(result);
      return;
    }
    setStatus("");
    setBoard(result);
    setOpenCount((n) => n + 1);
  }, []);

  const openHandle = useCallback(
    async (handle: FileSystemFileHandle) => {
      void saveLastFile(handle);
      setLastFile(handle);
      await openFile(await handle.getFile());
    },
    [openFile],
  );

  /** Shows the file picker. Falls back to a plain file input where the picker API is missing. */
  const pick = useCallback(async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker(PICKER_OPTIONS);
        await openHandle(handle);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("Couldn't open that file.");
      }
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".excalidraw,.json";
    input.onchange = () => input.files?.[0] && void openFile(input.files[0]);
    input.click();
  }, [openFile, openHandle]);

  const reopen = useCallback(async () => {
    if (!lastFile) return;
    // The browser asks once per launch before handing the file back.
    const ok =
      (await lastFile.queryPermission?.()) === "granted" || (await lastFile.requestPermission?.()) === "granted";
    if (!ok) return;
    try {
      await openFile(await lastFile.getFile());
    } catch {
      setStatus(`${lastFile.name} was moved or deleted. Use Open board…`);
    }
  }, [lastFile, openFile]);

  const close = useCallback(() => setBoard(null), []);

  return { board, boardKey: openCount, status, busy, lastFileName: lastFile?.name ?? null, openFile, pick, reopen, close };
}
