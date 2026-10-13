# Excalidraw Slideshow — project summary

_Last updated: 2026-10-13, v0.0.25_

## What it is

A web app that presents any `.excalidraw` board (or `.xlsx` Excel
workbook) as a slideshow: open a board, and ← / → move page to page, each
page fitted to the screen. Made because the owner draws long boards on excalidraw.com (pages stacked
top to bottom, 7–35 MB, lots of images) and the Obsidian Excalidraw plugin
can't cope with them. It presents, and lets the owner add text and pictures
on top (marked "Added", kept in the browser); real editing stays on
excalidraw.com, and the app never changes a board file. Boards never leave the owner's PC; the
browser reads them from folders the owner connects. Built by the owner, who
is learning frontend, with Claude Code. Repo:
github.com/AlexLCBranco/excalidraw-slideshow; every push to main deploys to
https://excalidraw-slideshow.vercel.app. Installable and works fully offline.
Priorities: ←/→ always land on the right page, pages found with no setup,
one click to open a board, clean code.

## Stack

Vite, React 19, TypeScript (strict), `@excalidraw/excalidraw` (read-only, in
view mode), ExcelJS (reads workbooks, in a Web Worker), CSS Modules +
design tokens, Vitest, oxlint. No state library and no backend: settings live in the browser (localStorage, IndexedDB).
Layered `app -> features -> lib -> domain -> styles`; page finding and
camera maths live in `domain/`, which has the tests.

## What works now

- Pages found automatically: frames if the board uses them, otherwise cut at
  the empty gaps roughly every screen-height; `-` / `=` change page height
- Whole-board view (W) to move, add or remove page cuts by hand, saved only
  when the owner presses Save
- Library: connect folders or files once, boards listed with a picture of
  their first page, refreshed when boards change
- Drag files from File Explorer onto the window, on either screen: a board
  or workbook opens and joins the library; several boards open as a group
  in the order dropped; anything else just says "Can't open .pdf files"
- Groups: play several boards back to back (a subfolder, or picked by hand)
- Excel workbooks (.xlsx): every visible sheet in tab order, laid out like
  Excel (controls in a strip along the top, sheet tabs along the
  bottom, page right under the controls, empty space below in the sheet's
  own colour); long or wide sheets split into pages of a screenful at 100%
  (header row repeated, pictures never cut); fills, colours, borders, merged cells and pictures
  as in Excel; cell notes as red corner marks, read by hovering; read in
  the background so the app never freezes
- Control bar, page grid (G), laser pointer (K), zoom, Hand / Select switch
- Select with a box, lasso (Alt+drag), Shift to add, Ctrl+A for the page;
  then Copy (pastes into excalidraw.com), Copy image, Copy text, and an
  opacity slider that only lasts while the board is open
- Add text (T) and pictures (I, or paste) on top of a board, each marked
  "Added" (drag to move, corner handle to resize, × to remove); kept only after "Save
  changes", in this browser; every save, discard, removal and leaving with
  unsaved changes asks "are you sure?" first. The board's own drawing can't
  be deleted
- Remembers the last page per board; every page has its own address
- Installable app that opens `.excalidraw` files directly, works offline,
  and updates itself only while the library is showing

## What's next

- The big idea: bring other apps into the boards, starting with a live
  Trello list. Open questions to settle first are in `PLAN.md`
- Step-by-step reveals: built and taken out for now; kept on a branch
- Revisit the lasso, which the owner finds weird in use

## Open problems

- Workbooks: bold/italic text shows plain (the app lists what it draws
  differently on opening); charts and Excel-drawn shapes don't show, and
  aren't detected, because ExcelJS doesn't read them
- The lasso feels off, and it isn't yet known why
