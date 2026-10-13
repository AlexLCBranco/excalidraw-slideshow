// End-to-end check that a board is shown near Excalidraw's 100%, in headless Edge.
//
//   npm run e2e:zoom                          against the live site
//   npm run e2e:zoom -- http://localhost:5180 against the dev server
//
// Drops a throwaway board made here (never one of the owner's): three screens
// drawn 1900 wide, as on excalidraw.com at 100%, plus one stray box far to
// the right on the third. Pages one and two must show at about 100%, not
// shrunk to the stray's width; on a big screen a page must stop at 100%.
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://excalidraw-slideshow.vercel.app";

const rect = (id, x, y, width, height) => ({
  id, type: "rectangle", x, y, width, height, angle: 0, strokeColor: "#1e1e1e",
  backgroundColor: "#a5d8ff", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1,
  opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1, version: 1, versionNonce: 1,
  isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
});
const BOARD = JSON.stringify({
  type: "excalidraw", version: 2, source: "e2e",
  elements: [rect("one", 0, 0, 1900, 900), rect("two", 0, 1000, 1900, 900), rect("three", 0, 2000, 1900, 900), rect("stray", 3000, 2100, 100, 100)],
  appState: { viewBackgroundColor: "#ffffff" }, files: {},
});

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ channel: "msedge" });
const errors = [];

async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.waitForSelector("text=Open a file");
  await page.evaluate((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], "e2e-zoom.excalidraw"));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, cancelable: true }));
  }, BOARD);
  await page.waitForSelector("text=1 / 3", { timeout: 30_000 });
  await page.waitForTimeout(800);
  return page;
}
const zoomShown = async (page) => parseInt(await page.getByTitle("Whole page").innerText(), 10);
/** How wide the 1900-unit box is drawn, in screen px per scene unit: the zoom Excalidraw really uses. */
const zoomDrawn = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas.excalidraw__canvas.static");
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext("2d");
    ctx.drawImage(canvas, 0, 0);
    const row = ctx.getImageData(0, Math.round(canvas.height / 2), canvas.width, 1).data;
    let first = -1, last = -1;
    for (let x = 0; x < canvas.width; x++) {
      const [r, g, b] = row.subarray(x * 4, x * 4 + 3);
      // The box's fill, #a5d8ff.
      if (Math.abs(r - 0xa5) < 30 && Math.abs(g - 0xd8) < 30 && b > 0xe0) {
        if (first < 0) first = x;
        last = x;
      }
    }
    return Math.round(((last - first) / devicePixelRatio / 1900) * 100);
  });
const next = async (page) => {
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
};

const hd = await open(1920, 1080);
const z1 = await zoomDrawn(hd);
check(z1 >= 95 && z1 <= 100, `a 1080p screen draws page 1 near 100% (${z1}%)`);
check(Math.abs((await zoomShown(hd)) - z1) <= 2, `the bar shows that zoom (${await zoomShown(hd)}%)`);
await next(hd);
const z2 = await zoomDrawn(hd);
check(z2 >= 95 && z2 <= 100, `page 2 too (${z2}%)`);
await next(hd);
const z3 = await zoomDrawn(hd);
check(z3 < z2, `page 3, holding the stray box, zooms out to fit it (${z3}%)`);
check((await hd.getByTitle("All pages (G)").first().innerText()).includes("3 / 3"), "→ reached page 3");

const big = await open(2560, 1440);
const zBig = await zoomDrawn(big);
check(zBig >= 98 && zBig <= 101, `a bigger screen stops at 100% (${zBig}%)`);

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
