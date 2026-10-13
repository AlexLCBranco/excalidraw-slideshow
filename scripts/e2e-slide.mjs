// End-to-end check that a page that isn't zoomed stays fixed on the screen, in headless Edge.
//
//   npm run e2e:slide                          against the live site
//   npm run e2e:slide -- http://localhost:5180 against the dev server
//
// Drops a throwaway two-page board made here (never one of the owner's),
// switches to the hand and drags across the page: nothing on screen may move,
// not even mid-drag. Then zooms in, where the hand does move the view, and
// checks ←/→ still page. It runs in a fresh browser profile.
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://excalidraw-slideshow.vercel.app";

/** Two pages, 1000 units apart, each with a rectangle. */
const rect = (id, y) => ({
  id, type: "rectangle", x: 0, y, width: 1600, height: 800, angle: 0, strokeColor: "#1e1e1e",
  backgroundColor: "#a5d8ff", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1,
  opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1, version: 1, versionNonce: 1,
  isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
});
const BOARD = JSON.stringify({
  type: "excalidraw", version: 2, source: "e2e",
  elements: [rect("one", 0), rect("two", 1100)],
  appState: { viewBackgroundColor: "#ffffff" }, files: {},
});

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(BASE);
await page.waitForSelector("text=Open a file");
await page.evaluate((text) => {
  const transfer = new DataTransfer();
  transfer.items.add(new File([text], "e2e-slide.excalidraw"));
  window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, cancelable: true }));
}, BOARD);
await page.waitForSelector("text=1 / 2", { timeout: 30_000 });
await page.waitForTimeout(800);

// The canvas only, so the control bar and cursor can't make a difference.
const canvas = () => page.locator("canvas.excalidraw__canvas.static").screenshot();
const pageCounter = () => page.locator("button", { hasText: /^\d+ \/ 2$/ }).first().innerText();

await page.keyboard.press("v");
await page.waitForTimeout(300);
const still = await canvas();
await page.mouse.move(800, 450);
await page.mouse.down();
await page.mouse.move(1100, 650, { steps: 10 });
await page.waitForTimeout(200);
check(still.equals(await canvas()), "with the hand, dragging an unzoomed page doesn't move it, even mid-drag");
await page.mouse.up();
await page.waitForTimeout(300);
check(still.equals(await canvas()), "and it's in the same place after letting go");

// Zoomed in, the hand does move around the page.
await page.getByRole("button", { name: /zoom in/i }).click();
await page.waitForTimeout(300);
const zoomed = await canvas();
await page.mouse.move(800, 450);
await page.mouse.down();
await page.mouse.move(1000, 550, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(300);
check(!zoomed.equals(await canvas()), "zoomed in, dragging with the hand moves around the page");

await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
check((await pageCounter()) === "2 / 2", "→ still goes to page 2");
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(300);
check((await pageCounter()) === "1 / 2", "← goes back to page 1");

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
