# Excalidraw Slideshow — Work in progress

What is queued, what is in flight, and what is deliberately not being built.
The record of what was built and why lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Where this app fits

The owner's big idea is the **gauntlet**: a canvas where everything is a
live, smooth widget (a "stone"). It is a separate project, not this one.

This app is **one of the stones**: a viewer for the owner's boards, the
ones that exist now and the ones made later in the gauntlet. It stays a
viewer, and its hard rules (read-only, ←/→ first) stay as they are. It does
not host other apps or live widgets inside boards; that is the gauntlet's job.

## In flight

| Item | Owner |
|------|-------|
| Split `Slideshow.tsx` by concern (usePages, useAdditions, useCamera, selectionActions, scene layers), a pure refactor behind `npm run e2e:all` | Claude |

## Queued

Ideas raised so far, not yet asked for. Don't start one without the owner
asking.

- Selection ideas from research, not yet asked for: drag direction decides
  (left-to-right = fully inside, right-to-left = anything touched); scribble
  to select what a line crosses (tldraw's Alt+drag); select similar (same
  colour or kind); Esc during a drag keeps the previous selection; named
  bookmarks to jump back to a selection; swapping between overlapping
  versions of a drawing (shares code with reveals).

## Not being built

- Other apps or live widgets inside boards (a Trello list, Boardkit). Trello
  was dropped: the owner only wanted a drag-and-drop list, which Boardkit
  already is. Live widgets belong to the gauntlet, not this viewer.
- Step-by-step reveals (→ shows parts of a page one step at a time). The
  owner wants the whole slide at once almost always; hiding sections is
  something done while making a board, not while viewing it. The old
  version stays on the `reveal-steps` branch (commit 9d19e4e) for reference
  only: `Slideshow.tsx` has changed too much to cherry-pick it.
- Editing workbooks, recalculating formulas, charts and shapes drawn in
  Excel (ExcelJS doesn't read them), bold and italic cell text (Excalidraw
  text has no bold). Workbooks are shown, never changed.
- Editing boards' own drawing. Editing happens on excalidraw.com; this app
  only presents, plus text and pictures added on top (kept in the browser,
  marked "Added"). Nothing of the board's own can be removed or changed.
- Writing to board files, including adding frames. The owner's files are
  read-only to this app.
- Spotlight (dimming everything outside a dragged box) and zoom to a
  dragged box. The owner turned both down.
- Uploading or sharing boards. The site is hosted, but boards never leave
  the owner's PC: the browser reads them from a folder the owner picks.
