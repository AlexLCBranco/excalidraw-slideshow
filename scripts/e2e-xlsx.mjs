// End-to-end check of opening an .xlsx workbook, in headless Edge.
//
//   npm run e2e                          against the live site
//   npm run e2e -- http://localhost:5181 against `npm run build && npm run preview`
//
// Drops tests/fixtures/UselessThotsBrRDD21.xlsx on the library, as the owner
// would, and checks: the page stays responsive while it's read, the sheet tabs,
// ←/→ across sheets, clicking a tab, and that the black sheet is really black.
// It runs in a fresh browser profile, so nothing it opens is left behind.
import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://excalidraw-slideshow.vercel.app";
const FIXTURE = path.resolve(import.meta.dirname, "../tests/fixtures/UselessThotsBrRDD21.xlsx");
const SHEETS = ["Results", "Rodada", "Power Rankings", "Mais Escalados", "Teams"];
/** While the workbook is read, the page must never freeze for longer than this. */
const MAX_FREEZE_MS = 250;

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

// Drop the workbook on the window, timing the longest stall of the page while it's read.
const bytes = readFileSync(FIXTURE).toString("base64");
await page.evaluate(async (b64) => {
  const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const transfer = new DataTransfer();
  transfer.items.add(new File([data], "UselessThotsBrRDD21.xlsx"));
  window.__stall = { worst: 0, sawSpinner: false };
  let last = performance.now();
  window.__ticker = setInterval(() => {
    const now = performance.now();
    // Only while the spinner shows: that's the reading, not Excalidraw starting up.
    if (document.body.innerText.includes("Opening")) {
      window.__stall.sawSpinner = true;
      window.__stall.worst = Math.max(window.__stall.worst, now - last);
    }
    last = now;
  }, 10);
  window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, cancelable: true }));
}, bytes);

await page.waitForSelector('nav[aria-label="Sheets"]', { timeout: 60_000 });
const stall = await page.evaluate(() => (clearInterval(window.__ticker), window.__stall));
check(stall.sawSpinner, "shows “Opening…” while the workbook is read");
check(stall.worst < MAX_FREEZE_MS, `page stays responsive while reading (longest stall ${Math.round(stall.worst)} ms)`);

const tabs = () => page.$$eval('nav[aria-label="Sheets"] button', (bs) => bs.map((b) => b.textContent));
const activeTab = () => page.$eval('nav[aria-label="Sheets"] [aria-current="page"]', (b) => b.textContent);
const pageNumber = async () => Number(new URL(page.url()).hash.slice(1));
check(JSON.stringify(await tabs()) === JSON.stringify(SHEETS), "a tab per sheet, in Excel's order");
check((await activeTab()) === "Results" && (await pageNumber()) === 1, "opens on the first sheet's first page");

// Let Excalidraw settle and the camera fit the page.
await page.waitForTimeout(1500);
const pixel = async (x, y) => {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return rgbOfOnePixelPng(png);
};
const maskHeight = await page.$eval("div[class*=mask]", (m) => m.getBoundingClientRect().height);
const sheet = await pixel(5, Math.round(maskHeight) + 5);
check(sheet.join() === "0,0,0", `empty cells of the column-painted sheet are black (got rgb ${sheet.join(",")})`);
const middle = await pixel(800, 450);
check(!["0,0,0", "18,18,18"].includes(middle.join()), `the picture shows (middle of the page is rgb ${middle.join(",")}, not sheet black or background)`);

// ←/→ walk across sheets.
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
check((await pageNumber()) === 2 && (await activeTab()) === "Rodada", "→ from the last page of Results lands on Rodada");
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(300);
check((await pageNumber()) === 1 && (await activeTab()) === "Results", "← goes back to Results");

// A tab jumps to its sheet's first page; → off its last page reaches the next sheet.
await page.click('nav[aria-label="Sheets"] >> text=Mais Escalados');
await page.waitForTimeout(300);
const maisFirst = await pageNumber();
check((await activeTab()) === "Mais Escalados", `clicking a tab jumps to its sheet (page ${maisFirst})`);
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(300);
check((await activeTab()) === "Power Rankings" && (await pageNumber()) === maisFirst - 1, "← from a sheet's first page lands on the last page of the sheet before");

// Notes: Power Rankings marks 12 cells with red corner triangles; hovering one shows its note.
await page.click('nav[aria-label="Sheets"] >> text=Power Rankings');
await page.waitForTimeout(1200);
const marks = await page.evaluate(() => {
  const canvas = document.querySelector("canvas.excalidraw__canvas.static");
  const { width, height } = canvas;
  const px = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const scale = width / canvas.getBoundingClientRect().width;
  const found = [];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] > 220 && px[i + 1] < 40 && px[i + 2] < 40) {
      const x = ((i / 4) % width) / scale, y = Math.floor(i / 4 / width) / scale;
      // One point per triangle: skip pixels close to one already found.
      if (!found.some((f) => Math.abs(f.x - x) < 8 && Math.abs(f.y - y) < 8)) found.push({ x, y });
    }
  }
  return found;
});
check(marks.length === 12, `a red triangle on each of the 12 noted cells (found ${marks.length})`);
check(!(await page.isVisible("[role=note]")), "no note shows until a cell is hovered");
if (marks.length) {
  await page.mouse.move(marks[0].x, marks[0].y + 2);
  await page.waitForTimeout(200);
  const note = (await page.isVisible("[role=note]")) ? await page.textContent("[role=note]") : "";
  check(note.startsWith("Alex Castelo Branco:"), `hovering a marked cell shows its note (“${note.slice(0, 50).replace(/\n/g, " ")}…”)`);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
  check(!(await page.isVisible("[role=note]")), "the note goes away when the mouse leaves the cell");
}

// The whole view says why pages can't be cut by hand.
await page.keyboard.press("w");
await page.waitForTimeout(500);
check(await page.isVisible("text=A workbook's pages follow its rows and pictures"), "W shows the pages, not editable");
await page.keyboard.press("Escape");

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);

/** The colour of a 1x1 PNG screenshot. A single pixel needs no PNG row filter undone. */
function rgbOfOnePixelPng(png) {
  const idat = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") idat.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return [raw[1], raw[2], raw[3]];
}
