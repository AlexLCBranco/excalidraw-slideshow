import { type Opacities, withOpacities } from "../../domain/opacity";
import type { Board } from "../../domain/scene";
import { clipboardText, selectionText } from "../../domain/selection";
import { renderPicture } from "../../lib/render";
import type { SelectionAction } from "./SelectionLayer";

interface Deps {
  /** The board as shown, additions included: where copied pictures' files come from. */
  shown: Board;
  opacities: Opacities;
  setOpacities: (change: (o: Opacities) => Opacities) => void;
  showToast: (text: string) => void;
}

/** What can be done with selected elements. The board itself is never changed. */
export function selectionActions({ shown, opacities, setOpacities, showToast }: Deps): SelectionAction[] {
  return [
    {
      label: "Copy",
      shortcut: "Ctrl+C",
      run: (els) =>
        navigator.clipboard.writeText(clipboardText(els, shown.files)).then(
          () => showToast(`Copied ${els.length} · paste into Excalidraw`),
          () => showToast("The browser didn't allow copying"),
        ),
    },
    {
      label: "Copy image",
      // As seen on screen, opacity changes included. The picture is handed over while it's
      // still being drawn, so the browser counts the copy as coming from the click.
      run: (els) =>
        navigator.clipboard
          .write([new ClipboardItem({ "image/png": renderPicture(withOpacities(els, opacities), shown) })])
          .then(
            () => showToast("Copied as an image · paste it anywhere"),
            () => showToast("The browser didn't allow copying"),
          ),
    },
    {
      label: "Copy text",
      run: (els) => {
        const text = selectionText(els);
        if (!text) return showToast("No writing in the selection");
        navigator.clipboard.writeText(text).then(
          () => showToast("Copied the text"),
          () => showToast("The browser didn't allow copying"),
        );
      },
    },
    {
      label: "Reset",
      // Selected elements come from the board, so they carry its own opacities.
      run: (els) => setOpacities((o) => ({ ...o, ...Object.fromEntries(els.map((e) => [e.id, e.opacity ?? 100])) })),
    },
  ];
}
