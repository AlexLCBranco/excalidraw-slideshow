// End-to-end check of dropping files from File Explorer onto the app, in headless Edge.
//
//   npm run e2e:drop                          against the live site
//   npm run e2e:drop -- http://localhost:5181 against `npm run build && npm run preview`
//
// The drops are real browser drags (Chrome DevTools' Input.dispatchDragEvent
// with file paths), the same events a drag from Explorer produces, file
// handles included. Checks: the overlay comes and goes without flicker, a
// board opens (pages, ←/→, address, last page remembered, joins the library),
// an unsupported file only shows a message, two files open as a group, a drop
// on the Excalidraw canvas never reaches Excalidraw, the browser-only fallback
// says so, a big board freezes the page no longer than opening it from the
// library does, and the page never navigates away or downloads anything.
// It makes its own boards in a temp folder and deletes them, and runs in a
// fresh browser profile, so nothing it opens is left behind.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://excalidraw-slideshow.vercel.app";
const OVERLAY = "[data-testid=drop-overlay]";
const NOTE = "[role=status]";

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};

// ---- Throwaway files ----

const dir = mkdtempSync(path.join(tmpdir(), "e2e-drop-"));
const rect = (id, y, extra = {}) => ({
  id, type: "rectangle", x: 0, y, width: 800, height: 500, angle: 0, strokeColor: "#1e1e1e",
  backgroundColor: "#a5d8ff", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0,
  opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1, version: 1, versionNonce: 1,
  isDeleted: false, boundElements: null, updated: 1, link: null, locked: false, ...extra,
});
/** A board of `pages` frames, each holding one shape: a page each. */
const board = (pages, files = {}, extra = () => ({})) =>
  JSON.stringify({
    type: "excalidraw", version: 2, source: "e2e",
    elements: Array.from({ length: pages }, (_, i) => [
      rect(`f${i}`, i * 1500 - 50, { type: "frame", name: `Page ${i + 1}`, x: -50, width: 900, height: 600 }),
      rect(`r${i}`, i * 1500, { frameId: `f${i}`, ...extra(i) }),
    ]).flat(),
    appState: { viewBackgroundColor: "#ffffff" }, files,
  });
const write = (name, content) => {
  const file = path.join(dir, name);
  writeFileSync(file, content);
  return file;
};

const A = write("e2e-drop-a.excalidraw", board(3));
const B = write("e2e-drop-b.excalidraw", board(1));
const C = write("e2e-drop-c.excalidraw", board(1));
const PDF = write("e2e-drop-notes.pdf", "%PDF-1.4 not really");
const PNG = write("e2e-drop-picture.png", Buffer.from("89504e470d0a1a0a", "hex"));
// About 20 MB of embedded pictures, like the owner's big boards.
const images = Object.fromEntries(
  Array.from({ length: 40 }, (_, i) => [
    `img${i}`,
    { id: `img${i}`, mimeType: "image/png", dataURL: "data:image/png;base64," + Buffer.alloc(384 * 1024, i).toString("base64"), created: 1 },
  ]),
);
const BIG = write("e2e-drop-big.excalidraw", board(40, images, (i) => ({ type: "image", fileId: `img${i}`, status: "saved", scale: [1, 1] })));

// ---- Browser ----

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
const downloads = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("download", (d) => downloads.push(d.suggestedFilename()));
const cdp = await page.context().newCDPSession(page);

/** Drags `files` from outside the window to (x, y), hovering over each point of `path` on the way. */
async function dragOver(files, path = [[700, 450]]) {
  const data = { items: [], files, dragOperationsMask: 1 };
  await cdp.send("Input.dispatchDragEvent", { type: "dragEnter", x: path[0][0], y: path[0][1], data });
  for (const [x, y] of path) await cdp.send("Input.dispatchDragEvent", { type: "dragOver", x, y, data });
  return data;
}
async function drop(files, at = [700, 450]) {
  const data = await dragOver(files, [at]);
  await cdp.send("Input.dispatchDragEvent", { type: "drop", x: at[0], y: at[1], data });
}
const hash = () => Number(new URL(page.url()).hash.slice(1));
const path_ = () => decodeURIComponent(new URL(page.url()).pathname);
const waitForTitle = (start) => page.waitForFunction((s) => document.title.startsWith(s), start, { timeout: 60_000 });
const noteText = async () => ((await page.isVisible(NOTE)) ? (await page.textContent(NOTE)).trim() : "");
// A mark on the page that survives anything but a real navigation or reload: proof the page never left.
// Each of the test's own trips to the library checks it first, then marks the fresh page.
let leftPage = false;
const stayed = () => page.evaluate(() => window.__stayed === true);
/** A board's (or group's) card in the library. */
const card = (name) => `main ol button:has-text("${name}")`;
const toLibrary = async () => {
  if (page.url().startsWith("http") && !(await stayed())) leftPage = true;
  await page.goto(BASE);
  await page.waitForSelector("text=/^v\\d+\\.\\d+\\.\\d+/");
  await page.evaluate(() => (window.__stayed = true));
};

await toLibrary();

// ---- The overlay ----

// Watch for the overlay disappearing at any point while the drag moves across the library's elements.
await page.evaluate((sel) => {
  window.__overlay = { shown: 0, hidden: 0 };
  new MutationObserver(() => {
    const on = document.querySelector(sel) !== null;
    if (on !== window.__overlay.on) window.__overlay[on ? "shown" : "hidden"]++;
    window.__overlay.on = on;
  }).observe(document.body, { childList: true, subtree: true });
}, OVERLAY);
const across = Array.from({ length: 12 }, (_, i) => [100 + i * 100, 80 + i * 60]);
await dragOver([A], across);
check(await page.isVisible(OVERLAY), "dragging a file over the window shows “Drop to open”");
check(await page.isVisible("text=Drop to open"), "the overlay says “Drop to open”");
const flicker = await page.evaluate(() => window.__overlay);
check(flicker.shown === 1 && flicker.hidden === 0, `no flicker while the drag crosses page elements (shown ${flicker.shown}×, hidden ${flicker.hidden}×)`);
// Esc ends the drag in Windows itself, which then tells the page the drag left (checked below).
// The DevTools version of a cancelled drag tells the page nothing at all, the worst case: the
// overlay must still go once the drag falls quiet.
await cdp.send("Input.dispatchDragEvent", { type: "dragCancel", x: 0, y: 0, data: { items: [], files: [A], dragOperationsMask: 1 } });
await page.waitForTimeout(1300);
check(!(await page.isVisible(OVERLAY)), "a drag cancelled without a word to the page still loses the overlay within a second");
await dragOver([A]);
await page.keyboard.press("Escape");
await page.waitForTimeout(100);
check(!(await page.isVisible(OVERLAY)), "Esc reaching the page hides the overlay at once");
await page.waitForTimeout(1300);

// Leaving the window: the browser's dragleave reaches us with no element left under the drag.
const fire = (steps) =>
  page.evaluate((steps) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["{}"], "x.excalidraw"));
    const at = { body: document.body, child: document.querySelector("header") };
    for (const [type, target] of steps) at[target].dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, steps);
await fire([["dragenter", "body"], ["dragenter", "child"], ["dragleave", "body"]]);
await page.waitForTimeout(100);
check(await page.isVisible(OVERLAY), "moving from an element onto its child keeps the overlay");
await fire([["dragleave", "child"]]);
await page.waitForTimeout(100);
check(!(await page.isVisible(OVERLAY)), "dragging out of the window hides the overlay");

await dragOver([A]);
await page.waitForTimeout(1500);
check(!(await page.isVisible(OVERLAY)), "a drag that goes quiet (no dragover for a second) hides the overlay");

// ---- One board ----

await drop([A]);
check(!(await page.isVisible(OVERLAY)), "dropping hides the overlay");
await waitForTitle("e2e-drop-a");
await page.waitForSelector("canvas.excalidraw__canvas");
check(path_() === "/view/e2e-drop-a.excalidraw" && hash() === 1, `a dropped board opens on its first page (${path_()}#${hash()})`);
await page.waitForTimeout(800);
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
check(hash() === 2, "→ goes to page 2, and the address says so");
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
check(hash() === 3, "its pages were found automatically (3 pages; → stops on the last)");
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(300);
check(hash() === 2, "← goes back");

// Excalidraw's own drop handling would load a dropped board or picture into the scene: it must never see a drop.
// With the Hand tool the drop lands on the board itself: Excalidraw's canvas, or the
// see-through layer that keeps an unzoomed page from being dragged. Either way Excalidraw must not see it.
await page.keyboard.press("v");
await page.waitForTimeout(300);
const onBoard = await page.evaluate(() => {
  window.__excalidrawSawDrop = false;
  document.querySelector(".excalidraw")?.addEventListener("drop", () => (window.__excalidrawSawDrop = true));
  return document.elementFromPoint(700, 400)?.closest(".excalidraw, [data-testid=pin]") != null;
});
check(onBoard, "with the Hand tool, the drop point is on the board");
await drop([PNG], [700, 400]);
await page.waitForTimeout(500);
check((await noteText()) === "Can't open .png files", `a picture dropped on the canvas only shows a message (“${await noteText()}”)`);
check(path_() === "/view/e2e-drop-a.excalidraw" && hash() === 2, "…and the board stays where it was");
await drop([B], [700, 400]);
await waitForTitle("e2e-drop-b");
check(path_() === "/view/e2e-drop-b.excalidraw", "a board dropped on the canvas of another opens through the app");
check(!(await page.evaluate(() => window.__excalidrawSawDrop)), "Excalidraw's own drop handling never saw either drop");

// Back in the library: the dropped boards are listed and reopen like the others, on the page last shown.
await toLibrary();
await page.waitForSelector(card("e2e-drop-a"), { timeout: 10_000 }).catch(() => {});
check(await page.isVisible(card("e2e-drop-a")), "the dropped board appears in the library after a reload");
await page.click(card("e2e-drop-a"));
await waitForTitle("e2e-drop-a");
await page.waitForTimeout(500);
check(hash() === 2, `reopened from the library, it resumes on the page last shown (page ${hash()})`);

// ---- An unsupported file ----

await toLibrary();
await drop([PDF]);
await page.waitForTimeout(500);
check((await noteText()) === "Can't open .pdf files", `a .pdf shows “Can't open .pdf files” (got “${await noteText()}”)`);
check(path_() === "/" && !(await page.isVisible("text=e2e-drop-notes")) && !(await page.isVisible(card("e2e-drop-notes"))), "…and does nothing else: still the library, not added to it");

// ---- Two files at once ----

await drop([C, B]);
await waitForTitle("e2e-drop-c + e2e-drop-b");
check(path_().startsWith("/view/~"), `two boards open as one group (${path_()})`);
await page.waitForTimeout(800);
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
check(hash() === 2, "→ moves from the first dropped board to the second");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
check(hash() === 2, "…in the order dropped, and the group has exactly their 2 pages");
await toLibrary();
await page.waitForSelector(card("e2e-drop-c + e2e-drop-b"), { timeout: 10_000 }).catch(() => {});
check(await page.isVisible(card("e2e-drop-c + e2e-drop-b")), "the group is in the library, to reopen later");

// ---- A browser without file handles ----

await page.evaluate(() => {
  const transfer = new DataTransfer();
  const elements = [{ id: "r", type: "rectangle", x: 0, y: 0, width: 400, height: 300, isDeleted: false }];
  transfer.items.add(new File([JSON.stringify({ type: "excalidraw", elements, files: {} })], "e2e-drop-session.excalidraw"));
  // As in Firefox and Safari: no way to keep a dropped file.
  DataTransferItem.prototype.getAsFileSystemHandle = undefined;
  window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, cancelable: true }));
});
await waitForTitle("e2e-drop-session");
check((await noteText()).startsWith("Opened for now only"), `without file handles the board opens, with a note (“${await noteText()}”)`);
await toLibrary();
check(!(await page.isVisible("text=e2e-drop-session")), "…and isn't added to the library");

// ---- A big board ----

/** The longest the page went without running a timer while “Opening…” showed, in ms. */
async function stallWhile(open) {
  await page.evaluate(() => {
    window.__stall = 0;
    let last = performance.now();
    window.__ticker = setInterval(() => {
      const now = performance.now();
      if (document.body.innerText.includes("Opening")) window.__stall = Math.max(window.__stall, now - last);
      last = now;
    }, 10);
  });
  await open();
  await waitForTitle("e2e-drop-big");
  return page.evaluate(() => (clearInterval(window.__ticker), window.__stall));
}
const dropped = await stallWhile(() => drop([BIG]));
await toLibrary();
await page.waitForSelector(card("e2e-drop-big"));
const fromLibrary = await stallWhile(() => page.click(card("e2e-drop-big")));
check(
  dropped <= fromLibrary * 1.5 + 100,
  `a 20 MB board freezes the page no longer when dropped (${Math.round(dropped)} ms) than opened from the library (${Math.round(fromLibrary)} ms)`,
);

// ---- Throughout ----

check(!leftPage && (await stayed()), "the page never navigated away or reloaded on a drop");
check(downloads.length === 0, `nothing was downloaded${downloads.length ? `: ${downloads.join(", ")}` : ""}`);
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);

await browser.close();
rmSync(dir, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
