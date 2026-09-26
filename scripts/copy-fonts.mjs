// Copies Excalidraw's fonts into public/ so the app never downloads them from a
// CDN and works offline. Runs after every `npm install` (see package.json).
import { cpSync, existsSync } from "node:fs";

const from = "node_modules/@excalidraw/excalidraw/dist/prod/fonts";
if (existsSync(from)) cpSync(from, "public/fonts", { recursive: true });
