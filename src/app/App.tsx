import { OpenScreen } from "../features/open/OpenScreen";
import { useBoardOpener } from "../features/open/useBoardOpener";
import { Slideshow } from "../features/slideshow/Slideshow";
import { VersionBadge } from "./VersionBadge";

/** Two screens: pick a board, then present it. */
export function App() {
  const opener = useBoardOpener();

  return (
    <>
      {opener.board ? (
        // Keyed by board, so opening another board starts a fresh slideshow.
        <Slideshow key={opener.boardKey} board={opener.board} onOpenAnother={opener.pick} onClose={opener.close} />
      ) : (
        <>
          <OpenScreen
            status={opener.status}
            busy={opener.busy}
            lastFileName={opener.lastFileName}
            onPick={opener.pick}
            onReopen={opener.reopen}
            onDropFile={opener.openFile}
          />
          <VersionBadge />
        </>
      )}
    </>
  );
}
