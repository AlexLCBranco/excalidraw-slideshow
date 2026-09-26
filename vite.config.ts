import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

function commitSha() {
  // Vercel builds have no .git folder, but say which commit they're building.
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "./package.json"), "utf-8"));

export default defineConfig({
  plugins: [
    react(),
    // Makes the site installable and fully offline: a service worker keeps a
    // copy of the whole app (Excalidraw and its fonts included).
    VitePWA({
      // A new version waits for a click in the library, so it never reloads mid-presentation.
      registerType: "prompt",
      manifest: {
        name: "Excalidraw Slideshow",
        short_name: "Slideshow",
        description: "Present Excalidraw boards page by page.",
        theme_color: "#121212",
        background_color: "#121212",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // Once installed, Windows offers this app for .excalidraw files ("Open with").
        file_handlers: [{ action: "/", accept: { "application/vnd.excalidraw+json": [".excalidraw"] } }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // Xiaolai (Excalidraw's CJK font, 13 MB in ~200 pieces) is cached on first use instead.
        globIgnores: ["fonts/Xiaolai/**"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/fonts/Xiaolai/"),
            handler: "CacheFirst",
            options: { cacheName: "fonts-xiaolai" },
          },
        ],
        // Excalidraw's main chunk is ~2 MB.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
      },
    }),
  ],
  // Fixed ports: the browser remembers the last board per address, so the
  // address must not change between launches.
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
  // Excalidraw itself is a ~2 MB chunk. It's downloaded once and then served
  // by the service worker, so the default 500 kB warning is noise here.
  build: { chunkSizeWarningLimit: 2500 },
  define: {
    // Shown on screen by VersionBadge; bumped by hand in every shipped commit.
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_SHA__: JSON.stringify(commitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: { include: ["src/**/*.test.ts"] },
});
