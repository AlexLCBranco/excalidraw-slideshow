import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

function commitSha() {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "./package.json"), "utf-8"));

export default defineConfig({
  plugins: [react()],
  // Fixed ports: the browser remembers the last board per address, so the
  // address must not change between launches.
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
  // Excalidraw itself is a ~2 MB chunk. It's served from this machine, so the
  // default 500 kB warning is noise here.
  build: { chunkSizeWarningLimit: 2500 },
  define: {
    // Shown on screen by VersionBadge; bumped by hand in every shipped commit.
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_SHA__: JSON.stringify(commitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: { include: ["src/**/*.test.ts"] },
});
