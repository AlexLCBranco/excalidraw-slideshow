# Excalidraw Slideshow

Presents any `.excalidraw` board as a slideshow. Use ← and → to change pages.

**To use it:** open https://excalidraw-slideshow.vercel.app in Edge or
Chrome, connect a folder of boards, then click a board. Install it from the
address bar's install icon to get its own window, open `.excalidraw` files
with it directly, and use it offline. Boards are read from your PC and never
uploaded.

**Local fallback:** double-click `Start Slideshow.bat`. It builds the app
and opens it on http://localhost:5181.

**For development:**

```bash
npm install
npm run dev
```

The dev server runs on http://localhost:5180. Every push to `main` deploys
to Vercel.

See [PROJECT.md](./PROJECT.md) for a short summary and
[ARCHITECTURE.md](./ARCHITECTURE.md) for how it works.
