# Excalidraw Slideshow — Architecture

## Layering

Dependencies point in one direction only.

```
app/        the two screens, chosen by the address bar
features/   library/ (the dashboard), open/ (picking and loading a board),
            slideshow/ (presenting it)
lib/        browser APIs: storage, folder scanning, drawing pages to images
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

## Cutting pages by hand (`domain/cuts.ts`, `CutOverview`)

`W` opens the whole-board view: the Excalidraw camera zooms out (it accepts
zooms far below its own 0.1 minimum through `updateScene`) and
`CutOverview` draws each page's outline and an orange line at every cut
over it. It opens on the current page and its neighbours, because a
30-page board fitted whole is a strip 40 px wide; scroll moves, Ctrl+scroll
zooms, "Show all" fits every page. Drag a line to move a cut, double-click
to add one or remove one; the dragged line is followed locally and handed
over on release, so pages (and the page grid's thumbnails) change once.

Only boards without frames can be cut (`canCut`). A column of pages is fully
described by its cuts, a sorted list of scene heights; `pagesFromCuts` takes
the rest from the automatic pages: each page is trimmed to the automatic
pages it overlaps (so a group's gaps between boards stay out), as wide as
they are, and named after the one it overlaps most. Changing cuts keeps the
same part of the board on screen (`pageAt`).

Cuts follow the temporary-changes rule with one exception the owner asked
for: they live in `Slideshow` state and are forgotten on close, unless the
owner presses Save, which stores them in localStorage (`cuts:<board>`).
"Automatic" goes back to the found cuts; saving that forgets the stored ones.
While cuts are set by hand, `-` / `=` do nothing and say so.

Lines, arrows and freedraw are measured by their `points`, not
`width`/`height`. Rotated shapes get the circle-bounding box, which is loose
but never too small.

## Groups: several boards as one (`domain/group.ts`, `lib/groups.ts`)

A group plays several boards back to back, as if they were one long board.
`stackBoards` builds that board in memory: each board's drawing is moved to
sit below the previous one (1000 units apart), and every element id is
prefixed per board (`0:`, `1:`…) because boards copied from one another share
ids. Every link between elements is renamed to match (frames, groups, text
in shapes, arrow bindings), and Excalidraw's ordering keys are dropped so it
makes fresh ones. The result keeps each board's elements as `parts`, and
`boardPages` finds pages board by board, so each board keeps its own
frames-or-bands choice; its automatically found pages are named after it.
The slideshow, camera and page grid don't know the difference.

There are two kinds, both listed under "Groups" in the library:

- **Folders.** Any folder *inside* a connected folder that holds two or more
  boards, played in name order (`01 intro`, `02 …`). Connected folders
  themselves aren't groups: they're collections, not talks. The id is the
  folder's path (`New folder/talk`), which never ends in `.excalidraw`, so it
  can't clash with a board id.
- **Made by hand.** "New group" turns board clicks into picks, numbered in
  click order. Saved in localStorage as board ids (`~<time>` ids), so per
  address like the rest of the library. Boards that go missing are left out
  and counted on the card.

A board in a group that can't be read is skipped; the group only fails to
open if none can. Resume and page height are remembered under the group's
name.

## Excel workbooks (`domain/sheet*.ts`, `lib/xlsx.ts`)

An `.xlsx` file becomes a `Board` like any other, so every slideshow control
(zoom, W, G, K, resume, per-page addresses) works on it unchanged. The
difference is that its pages are fixed when it's read (`board.pages`) rather
than found from the drawing, and `board.tabs` says where each sheet starts.

1. **Read** (`lib/xlsx.ts`, ExcelJS) into plain data (`domain/sheet.ts`):
   sizes in px (column width x 7, row points x 4/3, picture offsets
   EMU / 9525), colours as hex. Theme colours come from the file's theme,
   with tints; "Text 1" / "Background 1" are fixed black and white. Formulas
   show the result saved in the file. A cell with no style of its own takes
   its column's, then its row's (`indexSheet().style`): sheets are often
   painted by selecting whole columns. Anything drawn differently from Excel
   is collected into `board.notShown` and said once on opening.
2. **Paginate** (`domain/sheetPages.ts`). The shown area is every cell with a
   value or a look of its own, every merge and every picture (whole-column
   styles reach all 16,384 columns, so they don't count). Rows are cut into
   pages of at most 1920 x 960 px (what Excel shows of a sheet on a 1080p
   screen at 100%, less the window's title bar and the bottom strip), then
   columns if still too wide, read left to right then down. Each band of
   rows takes as many as fit, like scrolling down a screenful in Excel;
   columns are shared out evenly, so there's no sliver page. A cut never
   falls inside a picture or merge; a page may end early below a band of
   pictures once 85% full. The first written row (with merges starting in
   it) repeats atop later pages.
3. **Draw** (`domain/sheetScene.ts`). Each page is laid out on its own, one
   below the other, as locked Excalidraw shapes: a rectangle in the page's
   most common fill (so painted sheets show no seams), runs of other fills,
   gridlines only between unfilled cells, borders joined into lines, text
   placed and wrapped as Excel would (Helvetica, measured by a `Measure`
   passed in), pictures on top at their anchors. A cell with a note gets
   Excel's red corner triangle (a filled closed line), and the cell's box
   goes into `board.notes`. `NoteLayer` shows the note while the mouse is
   over that box (`domain/notes.ts`). It only listens to `pointermove` on the
   window and reads Excalidraw's live camera, so it never takes clicks or
   drags away from selecting, the laser or the hand.

All of it runs in a Web Worker (`lib/xlsx.worker.ts`, started by
`lib/boardFile.ts`): a 5 MB workbook takes a second or two to read, and the
app keeps running meanwhile ("Opening…"). The worker measures text with an
`OffscreenCanvas` in the font string Excalidraw draws with.

Excalidraw's dark theme inverts every colour, which would turn a black sheet
white, so workbooks (`board.exactColors`) use its light theme, with the
app's dark background around the pages. Workbooks don't join groups.
Tests: `sheetPages.test.ts`, `sheetScene.test.ts`, and `lib/xlsx.test.ts` on
a real file (`tests/fixtures/`); `npm run e2e` opens it on the live site in
headless Edge.

## Presenting (`features/slideshow/`)

Excalidraw runs with `viewModeEnabled` + `zenModeEnabled`, dark theme. The
app owns the camera: `fitPage` computes `zoom`, `scrollX` and `scrollY` so the
page is centred and fitted (Excalidraw draws scene point `p` at screen
`(p + scroll) * zoom`), then `updateScene` applies them. Two masks in the
background colour cover whatever of the neighbouring pages would still show
above and below. A workbook is shown as Excel shows a sheet: the page is held
to the top edge (any spare space goes below it), and one full-width strip
along the bottom holds the sheet tabs at the left and the control bar
(`docked`) at the right, instead of the floating bar.

Keys are captured on `window` in the capture phase, so Excalidraw never sees
the arrows (it would pan with them). The mouse wheel is swallowed so the
camera can't drift off the page.

Excalidraw re-centres itself shortly after mounting, so the first camera
move waits `SETTLE_MS` (300 ms) after the API arrives.

In view mode Excalidraw pans on every mouse drag, so the camera is re-applied
on every `pointerup`: a drag can never leave the page off-centre.

### Controls

The `ControlBar` stays on screen by default. It gets its own strip at the
bottom (`--bar-space`): the page is fitted into the area above it and the
bottom mask covers the strip, so the bar never hides any of the drawing. `H`
hides it (remembered): the page then uses the full height and the bar fades
in only while the mouse moves. A progress line along the bottom edge is
always visible, and a corner counter shows whenever the bar is hidden. The
cursor hides after 2.5 s without moving. `useSlideKeys` is the one keyboard entry point;
Esc backs out one step at a time (typed page number, overlay, selection,
laser or text tool, then the board; leaving with unsaved additions asks first).

- **Page grid (G).** Thumbnails come from Excalidraw's `exportToCanvas`,
  which crops exactly to a frame when given `exportingFrame`. Every page is
  handed over as a frame: the real one, or an in-memory stand-in for
  automatically found pages (`lib/render.ts`). They are drawn one at a time,
  only once the grid is first opened.
- **Laser (K).** Excalidraw's own laser can't run in view mode (the drag pans
  first), so `LaserPointer` is an SVG overlay drawing a dot and a fading
  trail. Sitting over the canvas, it also stops pointing from panning.
- **Hand / Select / Laser.** A switcher on the bar, as on excalidraw.com.
  Hand lets Excalidraw pan (only useful zoomed in); Select is the default,
  since an unzoomed drag would only snap back. V swaps the two, and the
  choice is remembered. The laser is temporary and returns to that choice.
- **Select (V).** Excalidraw can't select in view mode either, so
  `SelectionLayer` is the same kind of overlay: a drag draws a box, a click
  picks the topmost element. Which elements that means is worked out in
  `domain/selection.ts` from element bounds, widened to whole groups and the
  text inside shapes, as excalidraw.com does. While the box is being dragged,
  what it would pick is outlined live, using the same rule. Alt+drag draws a
  lasso instead: elements count as inside when the corners, edge midpoints
  and centre of their bounds all fall within the loop (even-odd rule). Shift
  adds to the selection; Shift+click on a selected element takes it out
  (`extendSelection`). Ctrl+A selects what lies wholly inside the current
  page. A selection belongs to its page.
  Actions on it are a list (`selectionActions` in `Slideshow`), so a new one
  is one entry. Copy writes Excalidraw's own clipboard format, so it pastes
  into excalidraw.com as shapes. Copy image puts a PNG on the clipboard,
  drawn by Excalidraw’s `exportToBlob` in dark mode at 2x (at most 4096 px a
  side) with any opacity changes applied, so it looks as it does on screen
  (`lib/render.ts`). The blob promise goes straight into the `ClipboardItem`,
  so the copy still counts as coming from the click. Copy text takes the
  text elements (as typed, not as wrapped in their shape) in reading order:
  rows top to bottom, where a text joins a row if its middle is above the
  row’s bottom, then left to right (`selectionText`). None of them change the board.
- **Opacity.** A slider next to the selection actions dims the selected
  elements, like excalidraw.com's, but only on screen. The chosen values
  live in `Slideshow` state (`domain/opacity.ts`) and are pushed to
  Excalidraw with `updateScene(..., CaptureUpdateAction.NEVER)`, starting
  from Excalidraw's own scene elements so nothing it restored on load is
  lost. `board.elements` keeps the originals, so Copy and the page grid
  never see the change, and closing the board forgets it. Reset puts the
  selection back to its own opacity. Every change made while viewing follows
  this pattern: state in `Slideshow`, applied on screen only, gone on close.
- **Resume.** The last page shown is saved per board and restored on open.

## Adding text and pictures (`domain/additions.ts`, `lib/additions.ts`)

The one kind of editing: text and pictures added on top of a board. The
board's own elements can never be removed or changed; only additions can be
moved or removed.

- **Text (T, or the T button).** `TextLayer` covers the page; a click opens
  a text box there, Enter adds it (Shift+Enter for a new line), Esc lets it
  go. The text is sized to the page (`textSizeFor`), so it reads the same on
  any board. While typing, `useSlideKeys` ignores every key (`isTyping`), so
  letters aren't shortcuts.
- **Pictures (I, the picture button, or Ctrl+V).** Read as a data: URL
  (`readImage`), centred on the page and shrunk to fit (`placeImage`). Paste
  is caught on `window` in the capture phase and never reaches Excalidraw,
  which would put the picture into its scene itself.
- **The mark.** `AddedLayer` draws a green dashed outline and an "Added"
  tag around every addition, so it never passes for the board's drawing.
  With the select tool, drag an addition (or, with any tool, its tag) to
  move it; drag the corner handle to resize it from its top-left corner
  (`scaled`: text by its size, a picture keeping its shape, never below
  4 units). Every step of a drag is measured from where it started, so
  nothing drifts. × removes it.

Additions are plain data (`Addition`), with ids starting `added:`.
`additionScene` turns them into Excalidraw elements (`convertToExcalidrawElements`)
and files; the scene effect in `Slideshow` swaps them in on top of
Excalidraw's own elements, the same way opacities are applied. `shown` (the
board plus additions) is what selecting, Copy and the page grid see; pages
are still found from the board alone, so adding never moves a cut.

They follow the temporary-changes rule with the same exception as cuts: kept
in `Slideshow` state until the owner presses Save, then stored in IndexedDB
(`added:<board>`; pictures are too big for localStorage). Every step that
can lose work asks first (`ConfirmDialog`): Save, Discard (back to the last
save), removing one, and leaving the board (Esc, Back, O) with unsaved
changes. Closing the tab gets the browser's own "Leave site?". The browser's
own Back button isn't caught. `npm run e2e:add` checks all of it in headless
Edge on a throwaway board.

## Addresses (`app/useRoute.ts`)

The address bar is the app's state: `/` is the library, `/view/<board id>#N`
is page N of a board. Opening a board pushes a history entry and Esc goes
Back, so the browser's Back/Forward, Refresh and bookmarks all work. Page
changes replace the `#N` without adding history. `App` follows the address:
it loads the board it names, or lets go of the open one (boards are tens of
MB). A board that fails to load, or isn't in the library, sends you back to
the library with a banner.

## Library (`features/library/`, `lib/library.ts`)

The site can't see the disk by itself, so the owner connects **sources**:
folders (`showDirectoryPicker`, Edge/Chrome) and single files (picker or
drag-and-drop). Their handles live in IndexedDB. On every visit the browser
may ask again before reading them; Chrome and Edge offer "Allow on every
visit" to stop that. The library shows a "Show my boards" button for it,
because the prompt needs a click.

Folders are scanned for `*.excalidraw` up to 4 levels deep, skipping hidden
folders (`.obsidian`, `.trash`). The list refreshes when the window regains
focus, so boards saved in the meantime appear. A board's id is its source's
name plus its path (`New folder/worldcupboard2026.excalidraw`). A file
already inside a connected folder isn't added twice, and connecting a folder
absorbs sources inside it.

Card pictures are the first page, drawn the same way as the page grid. Each
means parsing the whole board, so they're made one at a time, only when the
card scrolls into view, and cached in IndexedDB with the file's
size/modified time and the page height, so they're redrawn only when stale.

Files are read fresh on every open, so edits made on excalidraw.com and
re-saved to the same file show up the next time the board is opened. Browsers
without the File System Access API (Firefox, Safari) still get "Open a file"
and drag-and-drop, just not a remembered library.

## Dropping files (`domain/drop.ts`, `features/open/useWindowFileDrop.ts`)

Files dragged from Explorer can be dropped anywhere, on either screen.
`domain/drop.ts` decides what a drop opens: one `.excalidraw` or `.xlsx`
alone; two or more drawings as a group, in the order the browser hands them
over (saved as a hand-made group, reused if the same boards are dropped
again); workbooks never join a group; anything else gets "Can't open .pdf
files". Opening then goes through the same `present` → `useBoardLoader` path
as a library click.

The listeners sit on `window` in the **capture** phase and stop every drag
event there. That matters: Excalidraw's container has its own `onDrop` with
no view-mode check, which would load a dropped board into its scene or insert
a dropped picture or link, and it runs before any bubble-phase listener on
`window`. Capturing also stops the browser opening what was dropped. Only
text dragged onto a text field is let through.

The "Drop to open" overlay counts `dragenter`/`dragleave` (the enter on a
child comes before the leave on its parent, so it never flickers to zero),
and resets on drop, Esc, or a second without `dragover` (browsers repeat it
every few hundred ms, so silence means the drag ended without saying so).
Handles come from `DataTransferItem.getAsFileSystemHandle` (Edge/Chrome),
asked for before the first `await`; without it the board opens for this
visit only, with a note. `scripts/e2e-drop.mjs` drives real file drags
through DevTools' `Input.dispatchDragEvent`, file handles included.

## Offline

`@excalidraw/excalidraw` is bundled by Vite. Its fonts are copied from
`node_modules` to `public/fonts` by `scripts/copy-fonts.mjs` after every
install (gitignored), and `index.html` sets `window.EXCALIDRAW_ASSET_PATH =
"/"` so Excalidraw loads them from there instead of a CDN.

`vite-plugin-pwa` adds a service worker that precaches the whole build
(~8 MB), so after one visit the site works with no network. Xiaolai, the
CJK font (13 MB in ~200 pieces), is left out of the precache and cached on
first use instead. On each visit the saved copy opens instantly while a new
version, if any, downloads in the background. `useAutoUpdate` then switches
to it (one quick reload) as soon as the library is showing. If a board is
open, it waits until you go back to the library, so a presentation is never
interrupted. The worker only runs in production builds
(`npm run build`), not under `npm run dev`. The Claude desktop app's browser
pane can't register service workers; test offline in Edge or Chrome.

## Installing

The manifest makes the site installable (Edge/Chrome: the install icon in
the address bar). Installed, it opens in its own window, and its
`file_handlers` entry registers it for `.excalidraw` files, so "Open with"
(or a double-click once it's the default) opens a board straight into a
slideshow. The file arrives through `window.launchQueue`
(`features/open/useLaunchFiles.ts`) and joins the library like any opened file.

## Hosting and launching

The site is hosted on Vercel (https://excalidraw-slideshow.vercel.app), which
builds every push to `main` from the private GitHub repo. It's a static
build; `vercel.json` sends `/view/...` addresses to `index.html`, keeps
`sw.js` uncached (so updates are noticed) and caches hashed assets forever.
Hosting doesn't change where boards live: the site only reads folders the
owner connects in the browser.

`Start Slideshow.bat` is the local fallback: it installs on first run,
rebuilds (about 2 s), then runs `vite preview --open` on port 5181. Both
local ports are fixed because connected folders are remembered per address.

## History

- **v0.0.22** — Added text and pictures can be resized (corner handle) and
  moved by dragging them, not only their tag.
- **v0.0.23** — Workbooks look like Excel: pages fill a screenful of rows,
  start at the top edge, and the sheet tabs and controls share one strip
  along the bottom.
- **v0.0.21** — Add text and pictures on top of a board, marked "Added",
  saved in the browser only after "Save changes" and an "are you sure?".
- **v0.0.20** — Drop files from Explorer anywhere: a "Drop to open" overlay,
  several boards open as a group, other files get a short message, and
  Excalidraw never handles a drop itself.
- **v0.0.19** — Workbook cell notes: red corner marks, shown on hover.
- **v0.0.18** — Excel workbooks (.xlsx): sheets as pages, with sheet tabs.
- **v0.0.17** — Whole-board view (W): see the page cuts and move them by
  hand, with the choice to save them or not.
- **v0.0.8** — Zoom buttons, a Hand / Select / Laser switcher, and selecting: drag a box over elements and
  copy them.
- **v0.0.7** — Groups: play the boards of a folder, or boards picked by
  hand, back to back as one slideshow.
- **v0.0.5** — The control bar stays visible, with pages fitted above it;
  `H` hides it.
- **v0.0.4** — Installable app: offline service worker, update banner, opens
  `.excalidraw` files from File Explorer.
- **v0.0.3** — Library dashboard (connected folders, board cards with
  pictures, search, sort) and real addresses per board and page.
- **v0.0.2** — Control bar, page grid with thumbnails, go to page by number,
  full screen, laser pointer, shortcut help, resume at the last page.
- **v0.0.1** — Replaces a single-file HTML viewer (Excalidraw from a CDN,
  page boundaries typed in by hand) with this project. That in turn replaced
  a failed attempt with the Obsidian Excalidraw plugin, which crashed
  ("unknown problem... changes cannot be saved") on 21 MB boards even with no
  changes.
