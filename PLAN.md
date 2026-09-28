# Excalidraw Slideshow — Work in progress

What is queued, what is in flight, and what is deliberately not being built.
The record of what was built and why lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## The big idea

The owner wants to combine several apps into their Excalidraw boards, so the
board becomes the place everything lives. The first one named: a live
**Trello list** on a board. (tldraw, a more programmable canvas, came up as an
alternative base; the decision so far is to stay on Excalidraw, because the
boards are `.excalidraw` files and only Excalidraw draws them exactly.)

### Trello list: open questions (ask before building)

- Where: while drawing on excalidraw.com (not possible there: Trello doesn't
  allow embedding, as far as we know) or while presenting in this app
  (possible: Excalidraw's `renderEmbeddable` lets the app draw its own
  content in place of an embedded Trello link)?
- See only, or also move / tick / add cards?
- Offline: show the last version seen, update when online?

## In flight

| Item | Owner |
|------|-------|
| _nothing_ | — |

## Queued

Ideas raised so far, not yet asked for. Don't start one without the owner
asking.

- Step-by-step reveals (select elements, "Add step"; → shows each step
  before moving on, ← hides them). Built, tested and taken out for now: the
  full version lives on the `reveal-steps` branch (commit 9d19e4e). To bring
  it back, cherry-pick that commit onto `main`.
- Selection ideas from research, not yet asked for: drag direction decides
  (left-to-right = fully inside, right-to-left = anything touched); scribble
  to select what a line crosses (tldraw's Alt+drag); select similar (same
  colour or kind); Esc during a drag keeps the previous selection; named
  bookmarks to jump back to a selection; swapping between overlapping
  versions of a drawing (shares code with reveals).
- Revisit the lasso (Alt+drag). The owner finds it weird in use; find out
  what feels off before changing it.

## Not being built

- Editing boards. Editing happens on excalidraw.com; this app only presents.
- Writing to board files, including adding frames. The owner's files are
  read-only to this app.
- Spotlight (dimming everything outside a dragged box) and zoom to a
  dragged box. The owner turned both down.
- Uploading or sharing boards. The site is hosted, but boards never leave
  the owner's PC: the browser reads them from a folder the owner picks.
