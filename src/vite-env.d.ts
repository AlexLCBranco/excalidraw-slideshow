/// <reference types="vite/client" />

// Build-time constants injected by vite.config.ts's `define`.
declare const __APP_VERSION__: string;
declare const __COMMIT_SHA__: string;
declare const __BUILD_TIME__: string;

interface Window {
  EXCALIDRAW_ASSET_PATH?: string;
}
