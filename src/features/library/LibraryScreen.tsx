import { useEffect, useMemo, useRef, useState } from "react";

import { type BoardEntry, canConnectFolders } from "../../lib/library";
import { loadLastOpened, type Source } from "../../lib/storage";
import { ShortcutList } from "../slideshow/ShortcutList";
import { BoardCard } from "./BoardCard";
import { displayName } from "./format";
import styles from "./LibraryScreen.module.css";
import type { LibraryState } from "./useLibrary";

type Sort = "opened" | "edited" | "name";

const SORTS: Record<Sort, { label: string; compare: (a: BoardEntry, b: BoardEntry) => number }> = {
  opened: {
    label: "Recently opened",
    compare: (a, b) => loadLastOpened(b.name) - loadLastOpened(a.name) || b.lastModified - a.lastModified,
  },
  edited: { label: "Last edited", compare: (a, b) => b.lastModified - a.lastModified },
  name: { label: "Name", compare: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) },
};

interface Props {
  state: LibraryState;
  sources: readonly Source[];
  entries: readonly BoardEntry[];
  /** A message to show above the boards, such as a board that failed to open. */
  notice: string;
  onDismissNotice: () => void;
  dragging: boolean;
  onOpen: (entry: BoardEntry) => void;
  onOpenFile: () => void;
  onConnectFolder: () => void;
  onRemoveSource: (source: Source) => void;
  onAllowAccess: () => void;
}

/** The home screen: every board in the connected folders, as cards. */
export function LibraryScreen(p: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("opened");
  const search = useRef<HTMLInputElement>(null);

  // "/" jumps to the search box, as on most sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== search.current) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return p.entries.filter((e) => displayName(e.name).toLowerCase().includes(q)).sort(SORTS[sort].compare);
  }, [p.entries, query, sort]);

  const hasBoards = p.state === "ready" && p.entries.length > 0;

  return (
    <div className={styles.screen} data-dragging={p.dragging}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img src="/favicon.svg" alt="" className={styles.logo} />
          Excalidraw Slideshow
        </div>
        {hasBoards && (
          <div className={styles.tools}>
            <input
              ref={search}
              className={styles.search}
              type="search"
              placeholder="Search boards   /"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search boards"
            />
            <select
              className={styles.sort}
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort boards"
            >
              {Object.entries(SORTS).map(([key, s]) => (
                <option key={key} value={key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {p.sources.length > 0 && (
          <div className={styles.actions}>
            <button className={styles.secondary} onClick={p.onOpenFile}>
              Open file…
            </button>
            {canConnectFolders() && (
              <button className={styles.primary} onClick={p.onConnectFolder}>
                Connect folder
              </button>
            )}
          </div>
        )}
      </header>

      <main className={styles.main}>
        {p.notice && (
          <p className={styles.banner} role="alert">
            {p.notice}
            <button onClick={p.onDismissNotice} aria-label="Dismiss">
              ×
            </button>
          </p>
        )}

        {p.sources.length > 0 && (
          <ul className={styles.sources} aria-label="Connected folders and files">
            {p.sources.map((s, i) => (
              <li key={i} className={styles.source}>
                {s.kind === "directory" ? "Folder" : "File"}: <strong>{s.name}</strong>
                <button onClick={() => p.onRemoveSource(s)} aria-label={`Disconnect ${s.name}`} title="Disconnect">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {p.state === "blocked" && (
          <Hero title="Welcome back">
            <p>Your browser asks once per visit before showing your boards again.</p>
            <p className={styles.hint}>Choose “Allow on every visit” to skip this step next time.</p>
            <button className={styles.primary} onClick={p.onAllowAccess}>
              Show my boards
            </button>
          </Hero>
        )}

        {p.state === "ready" && p.sources.length === 0 && (
          <Hero title="Present your Excalidraw boards">
            <p>
              Connect the folder where you save your boards. They stay on this computer; nothing is uploaded.
            </p>
            <div className={styles.heroActions}>
              {canConnectFolders() ? (
                <button className={styles.primary} onClick={p.onConnectFolder}>
                  Connect folder
                </button>
              ) : (
                <p className={styles.hint}>Connecting folders needs Chrome or Edge.</p>
              )}
              <button className={styles.secondary} onClick={p.onOpenFile}>
                Open a file
              </button>
            </div>
            <p className={styles.hint}>Or drop a .excalidraw file anywhere on this window.</p>
          </Hero>
        )}

        {p.state === "ready" && p.sources.length > 0 && p.entries.length === 0 && (
          <Hero title="No boards found">
            <p>None of the connected folders hold .excalidraw files.</p>
          </Hero>
        )}

        {hasBoards && (
          <>
            {shown.length === 0 && <p className={styles.notice}>No boards match “{query}”.</p>}
            <ol className={styles.grid}>
              {shown.map((entry) => (
                <li key={entry.id}>
                  <BoardCard entry={entry} onOpen={p.onOpen} />
                </li>
              ))}
            </ol>
          </>
        )}
      </main>

      <footer className={styles.footer}>
        <details className={styles.shortcuts}>
          <summary>Keyboard shortcuts</summary>
          <ShortcutList />
        </details>
      </footer>
    </div>
  );
}

function Hero({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.hero}>
      <h1 className={styles.heroTitle}>{title}</h1>
      {children}
    </section>
  );
}
