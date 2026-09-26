# Excalidraw Slideshow — Architecture

## Layering

Dependencies point in one direction only.

```
app/        the two screens and switching between them
features/   open/ (picking and parsing a board) and slideshow/ (presenting it)
lib/        browser storage: page height per board, last-opened file handle
domain/     pure TypeScript: board parsing, page detection, camera maths. No React.
styles/     design tokens + global reset
```

`domain/` is the part worth protecting. It holds the only non-obvious logic
(finding pages) and is unit-tested as plain functions (`npm test`).

## How pages are found (`domain/pages.ts`)

1. **Frames first.** If the board has frames and they hold at least 80% of
   the other elements, each frame is a page, in reading order (top to
   bottom, then left to right). The 80% rule exists because some real boards
   carry one or two stray frames that aren't meant as pages.
2. **Otherwise, horizontal bands.** Collect every element's vertical extent,
   sweep them to find empty horizontal gaps, then walk down the board: each
   cut goes in the gap nearest `top + pageHeight` (within ±40%, slightly
   favouring wider gaps). If no gap is in range, cut at exactly
   `pageHeight`. Every page spans the full content width, so the zoom stays
   steady from page to page. A leftover strip shorter than 35% of a page
   joins the last page, and a board always gets at least one page.

`pageHeight` defaults to 1000 scene units, which matches the owner's boards
(one screen-sized section per 1000 units, drifting to ~985 further down).
`-` / `=` change it per board, and the choice is saved in localStorage.

Lines, arrows and freedraw are measured by their `points`, not
`width`/`height`. Rotated shapes get the circle-bounding box, which is loose
but never too small.

## Presenting (`features/slideshow/`)

Excalidraw runs with `viewModeEnabled` + `zenModeEnabled`, dark theme. The
app owns the camera: `fitPage` computes `zoom`, `scrollX` and `scrollY` so the
page is centred and fitted (Excalidraw draws scene point `p` at screen
`(p + scroll) * zoom`), then `updateScene` applies them. Two masks in the
background colour cover whatever of the neighbouring pages would still show
above and below.

Keys are captured on `window` in the capture phase, so Excalidraw never sees
the arrows (it would pan with them). The mouse wheel is swallowed so the
camera can't drift off the page.

Excalidraw re-centres itself shortly after mounting, so the first camera
move waits `SETTLE_MS` (300 ms) after the API arrives.

## Opening boards (`features/open/`)

Edge and Chrome support the File System Access API, so the picker returns a
file handle. It's stored in IndexedDB, which lets "Reopen <board>" work
across launches after one permission prompt. Drag-and-drop and a plain
`<input type=file>` fallback go through the same `parseBoard`.

Files are read fresh on every open, so edits made on excalidraw.com and
re-saved to the same file show up the next time the board is opened.

## Offline

`@excalidraw/excalidraw` is bundled by Vite. Its fonts are copied from
`node_modules` to `public/fonts` by `scripts/copy-fonts.mjs` after every
install (gitignored), and `index.html` sets `window.EXCALIDRAW_ASSET_PATH =
"/"` so Excalidraw loads them from there instead of a CDN.

## Launching

`Start Slideshow.bat` installs on first run, rebuilds (about 2 s), then runs
`vite preview --open` on port 5181. If the port is already serving, it just
opens a new tab. Both ports are fixed because the IndexedDB file handle
belongs to the page's address.

## History

- **v0.0.1** — Replaces a single-file HTML viewer (Excalidraw from a CDN,
  page boundaries typed in by hand) with this project. That in turn replaced
  a failed attempt with the Obsidian Excalidraw plugin, which crashed
  ("unknown problem... changes cannot be saved") on 21 MB boards even with no
  changes.
