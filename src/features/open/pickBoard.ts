/** What the user chose to open: a handle where the browser supports them (Edge, Chrome), else a plain file. */
export type Picked = FileSystemFileHandle | File;

const PICKER_OPTIONS = {
  id: "boards",
  types: [{ description: "Excalidraw board", accept: { "application/json": [".excalidraw", ".json"] } }],
};

/** Shows the file picker. Resolves to null when cancelled. */
export async function pickBoardFile(): Promise<Picked | null> {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker(PICKER_OPTIONS);
      return handle;
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".excalidraw,.json";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Shows the folder picker (Edge, Chrome). Resolves to null when cancelled. */
export async function pickBoardFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await window.showDirectoryPicker?.({ id: "boards", mode: "read" })) ?? null;
  } catch {
    return null;
  }
}
