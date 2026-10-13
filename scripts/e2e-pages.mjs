// End-to-end check of page sizes, hand-made cuts and the camera, in headless Edge.
//
//   npm run e2e:pages                          against the live site
//   npm run e2e:pages -- http://localhost:5180 against the dev server
//
// Drops a throwaway board made here (never one of the owner's): 160 thin
// boxes stacked evenly, about 40 automatic pages. Checks that - and = resize
// the pages and stay on the same part of the board, that cuts made in the
// whole-board view (W) can be added, saved and undone, that the wheel moves
// and zooms that view, and that the zoom buttons and the hand behave. It runs
// in a fresh browser profile, so nothing it saves outlives the run.
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://excalidraw-slideshow.vercel.app";

const rect = (i) => ({
  id: `r${i}`, type: "rectangle", x: 0, y: i * 250, width: 1600, height: 100, angle: 0, strokeColor: "#1e1e1e",
  backgroundColor: `hsl(${(i * 37) % 360} 70% 70%)`, fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0,
  opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1, version: 1, versionNonce: 1,
  isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
});
const BOARD = JSON.stringify({
  type: "excalidraw", version: 2, source: "e2e",
  elements: Array.from({ length: 160 }, (_, i) => rect(i)),
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
  transfer.items.add(new File([text], "e2e-pages.excalidraw"));
  window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, cancelable: true }));
}, BOARD);
await page.waitForSelector("text=/^1 \\/ \\d+$/", { timeout: 30_000 });
await page.waitForTimeout(800);

const settle = () => page.waitForTimeout(350);
const key = async (k) => {
  await page.keyboard.press(k);
  await settle();
};
/** The bar's "page / pages", as two numbers. */
const counter = async () => {
  const [at, of] = (await page.locator("button", { hasText: /^\d+ \/ \d+$/ }).first().innerText()).split(" / ").map(Number);
  return { at, of };
};
const zoomShown = async () => parseInt(await page.getByTitle("Whole page").innerText(), 10);
// The middle of the screen only, clear of the bar and notices, which change with the tool.
const drawing = () => page.screenshot({ clip: { x: 0, y: 120, width: 1600, height: 600 } });
/** Page n's outline in the whole-board view (its number button sits inside it). */
const box = (n) => page.getByTitle(`Go to page ${n}`, { exact: true }).locator("..").boundingBox();
const near = (a, b, by) => Math.abs(a - b) <= by;

// ---- Resizing pages with - and = ----

const auto = await counter();
check(auto.of >= 30, `the board is split into pages automatically (${auto.of})`);
for (const d of "30") await page.keyboard.press(d);
await key("Enter");
check((await counter()).at === 30, "typing 30 and Enter goes to page 30");

await key("-");
await key("-");
await key("-");
const small = await counter();
check(small.of > auto.of, `- makes the pages smaller, so there are more (${auto.of} → ${small.of})`);
check(await page.isVisible(`text=${small.of} pages`), `…and says how many (“${small.of} pages”)`);
const expected = Math.round((30 * small.of) / auto.of);
check(small.at !== 30 && near(small.at, expected, 2), `…staying on the same part of the board (page ${small.at}, about ${expected})`);

await key("=");
await key("=");
await key("=");
const back = await counter();
check(back.of === auto.of, `= makes them bigger again (${back.of} pages)`);
check(near(back.at, 30, 1), `…back around page 30 (page ${back.at})`);

// ---- The whole-board view (W): the wheel, Show all ----

await key("w");
check(await page.isVisible("role=dialog[name='Whole board']"), "W opens the whole board");
check(await page.isVisible("text=Automatic cuts"), "…with the automatic cuts");
const before = await box(back.at);
check(before !== null && before.y > -before.height && before.y < 900, "…around the current page");
await page.mouse.move(800, 450);
await page.mouse.wheel(0, 300);
await settle();
const scrolled = await box(back.at);
check(near(before.y - scrolled.y, 300, 5), `scrolling moves the view (${Math.round(before.y - scrolled.y)} px for 300)`);
await page.keyboard.down("Control");
await page.mouse.wheel(0, -300);
await page.keyboard.up("Control");
await settle();
const zoomedIn = await box(back.at);
check(zoomedIn.height > scrolled.height * 2, `Ctrl+scrolling zooms in (page ${Math.round(scrolled.height)} → ${Math.round(zoomedIn.height)} px tall)`);
await page.getByRole("button", { name: "Show all" }).click();
await settle();
const first = await box(1);
const last = await box(back.of);
check(first.y >= 0 && last.y + last.height <= 900, "Show all fits every page on the screen");

// ---- Cuts by hand ----

// Reopened, W shows the current page big again. Double-clicking halfway down it adds a cut there.
await page.getByRole("button", { name: "Done" }).click();
await settle();
await key("w");
const current = await box(back.at);
await page.mouse.dblclick(current.x + current.width / 2, current.y + current.height / 2);
await settle();
check(await page.isVisible("text=Your cuts · not saved"), "double-clicking adds a cut, not saved yet");
await page.getByRole("button", { name: "Save" }).click();
await settle();
check(await page.isVisible("text=Your cuts · saved in this browser"), "Save keeps them");
await page.getByRole("button", { name: "Done" }).click();
await settle();
const cut = await counter();
check(cut.of === auto.of + 1, `there's one more page (${cut.of})`);
check(near(cut.at, back.at, 1), `…and it stays on the same part of the board (page ${cut.at})`);
await key("-");
check(await page.isVisible("text=This board's pages are cut by hand"), "- with cuts by hand says to use W instead");
check((await counter()).of === cut.of, "…and changes nothing");

await key("w");
await page.getByRole("button", { name: "Automatic" }).click();
await settle();
check(await page.isVisible("text=Automatic cuts · not saved"), "Automatic goes back to the automatic cuts, not saved yet");
await key("Escape");
check((await counter()).of === auto.of, `…with the automatic pages again (${(await counter()).of})`);

// ---- Zooming a page ----

const fitted = await zoomShown();
const zoomIn = page.getByRole("button", { name: /zoom in/i });
const zoomOut = page.getByRole("button", { name: /zoom out/i });
await zoomIn.click();
await settle();
check((await zoomShown()) > fitted, `zoom in zooms (${fitted}% → ${await zoomShown()}%)`);
await zoomOut.click();
await settle();
check((await zoomShown()) === fitted, "zoom out back to the whole page");
await zoomIn.click();
await zoomIn.click();
await settle();
await page.getByTitle("Whole page").click();
await settle();
check((await zoomShown()) === fitted, "the zoom figure goes back to the whole page");

// Zoomed, a drag with the hand is kept when switching to the select tool.
await zoomIn.click();
await key("v");
await page.mouse.move(800, 450);
await page.mouse.down();
await page.mouse.move(1000, 550, { steps: 10 });
await page.mouse.up();
await settle();
const dragged = await drawing();
await key("v");
check(dragged.equals(await drawing()), "switching from the hand to select keeps where the drag left the page");
const at = (await counter()).at;
await key("ArrowRight");
check((await counter()).at === at + 1, "→ still goes to the next page");
check((await zoomShown()) === fitted, "…and the page is fitted again");

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
