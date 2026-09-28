# Excalidraw Slideshow — Work in progress

What is queued, what is in flight, and what is deliberately not being built.
The record of what was built and why lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

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
