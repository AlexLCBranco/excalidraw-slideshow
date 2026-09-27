# Excalidraw Slideshow — context for Claude

Read this first. It is loaded automatically at the start of every session.

## What this project is

A web app (https://excalidraw-slideshow.vercel.app, installable and fully
offline) that presents any `.excalidraw` board as a slideshow: open a
board, then the left and right arrow keys move page to page. The owner draws
long boards on excalidraw.com with each "page" stacked vertically, and the
Obsidian Excalidraw plugin can't handle their size (7–35 MB, many embedded
images). This app replaces that. Boards never leave the owner's PC: the
browser reads them from folders the owner connects.

The owner is new to Windows dev tooling and learning frontend development
(their main project is Boardkit, `C:\Users\alexc\Projects\boardkit`; this
project copies its conventions). Keep explanations short with exact
click-by-click steps. Explain design decisions briefly as you go.

## Hard rules

- **Never modify the owner's `.excalidraw` files.** The app only reads them.
  Boards live in `C:\Users\alexc\OneDrive\New folder\` and
  `C:\Users\alexc\Documents\Obsidian Vault\`. Test against copies, and never
  commit a board (`*.excalidraw` is gitignored).
- **Arrow-key paging is the product.** Anything that makes ←/→ less reliable
  is a regression, whatever else it gains.
- **Changes made while viewing are temporary.** Anything the owner changes
  on a board in the app (opacity today, more later) is for that viewing only:
  kept in memory while the board is open, never written to the file and never
  saved in the browser. Closing the board forgets it all.
- **Works offline.** No runtime CDN loads. Excalidraw and its fonts ship from
  `node_modules` / `public/fonts`, and the service worker precaches the build.
- **Never reload mid-presentation.** New versions apply themselves, but only
  while the library is showing (`app/useAutoUpdate.ts`).

## Priorities, in order

1. ←/→ always land on the right page, fitted to the screen
2. Page detection that needs no setup on any board
3. Opening a board is one click
4. Very clean code
5. Easy to extend later

## How to work

- `PLAN.md` lists what is queued and what is deliberately not being built.
  Read it before starting; update it when something lands.
- Every change must end with a running application.
- Before writing code, say what you are building and why.
- After finishing a piece of work, record anything architecturally
  significant in `ARCHITECTURE.md`.

## Non-negotiable technical rules

- **Layering.** Dependencies point one way:
  `app -> features -> lib -> domain -> styles`.
  `domain/` imports no React and no Excalidraw. Ever. It is where page
  detection and camera maths live, and it is what the tests cover.
- **No hardcoded visual constants.** Every colour, spacing, radius, duration
  and z-index comes from `src/styles/tokens.css`. Styling is CSS Modules.
- **Excalidraw is read-only here.** It runs with `viewModeEnabled`; the app
  moves its camera through `updateScene`, and may change how elements are
  drawn for the current viewing (see the temporary-changes rule above).
  Don't add editing.
- Excalidraw's internal class names (hidden in `styles/global.css`) are not a
  public API. After upgrading `@excalidraw/excalidraw`, check the menu, zoom
  buttons and help icon are still hidden.

## Stack

Vite, React 19, TypeScript (strict), `@excalidraw/excalidraw`, CSS Modules,
Vitest, oxlint. No state library: the app's state is a handful of
`useState`s. Add one only if that stops being true.

## Git

One commit per coherent change, on `main`, made only after `npm run build`
and `npm test` pass.

Subject line: a short imperative description. Body: a short bullet list of
what changed and why, not a file listing. Do not commit work in progress.

Bump `package.json`'s patch version (0.0.1 -> 0.0.2 -> ...) in every commit
that ships a user-visible change. It's shown on the library screen
(`VersionBadge`), so the owner can check they're running the latest build.

Remote: `github.com/AlexLCBranco/excalidraw-slideshow` (private). Vercel
deploys every push to `main`, so push after committing.

## Commands

```bash
npm run dev      # dev server on :5180 (use this while coding)
npm run build    # type-check + production build
npm test         # unit tests for domain/
npm run lint     # oxlint
```

The owner uses the deployed site, installed as an app from Edge/Chrome.
`Start Slideshow.bat` still builds and serves `dist/` on :5181 as a local
fallback. The ports are fixed on purpose: connected folders are remembered
per address, so every address (5180, 5181, vercel.app) has its own library.

The service worker only runs in production builds. The desktop app's browser
pane can't register service workers at all, so test offline behaviour in
headless Edge (e.g. `playwright-core` with `channel: "msedge"`).
