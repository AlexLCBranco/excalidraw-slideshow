// End-to-end check of what's drawn over a board and what selecting can do, in headless Edge.
//
//   npm run e2e:select                          against the live site
//   npm run e2e:select -- http://localhost:5180 against the dev server
//
// Drops a throwaway one-page board made here (never one of the owner's): a
// box and a line of writing. Adds text on top and checks it's drawn on the
// canvas; changes a selection's opacity and resets it; copies a selection
// as elements, as an image and as text. Nothing is saved, and it runs in a
// fresh browser profile.
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://excalidraw-slideshow.vercel.app";

const common = {
  angle: 0, strokeColor: "#1e1e1e", backgroundColor: "#a5d8ff", fillStyle: "solid", strokeWidth: 2,
  strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1,
  version: 1, versionNonce: 1, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
};
const BOARD = JSON.stringify({
  type: "excalidraw", version: 2, source: "e2e",
  elements: [
    { ...common, id: "box", type: "rectangle", x: 0, y: 0, width: 800, height: 400 },
    {
      ...common, id: "words", type: "text", x: 0, y: 500, width: 220, height: 45, text: "hello e2e", originalText: "hello e2e",
      fontSize: 36, fontFamily: 1, textAlign: "left", verticalAlign: "top", containerId: null, lineHeight: 1.25,
    },
  ],
  appState: { viewBackgroundColor: "#ffffff" }, files: {},
});

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE).origin });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(BASE);
await page.waitForSelector("text=Open a file");
await page.evaluate((text) => {
  const transfer = new DataTransfer();
  transfer.items.add(new File([text], "e2e-select.excalidraw"));
  window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, cancelable: true }));
}, BOARD);
await page.waitForSelector("text=1 / 1", { timeout: 30_000 });
await page.waitForTimeout(800);

const settle = () => page.waitForTimeout(350);
/** A patch of the screen, to compare before and after. */
const patch = (x, y, width, height) => page.screenshot({ clip: { x, y, width, height } });
// The page is fitted at 100% and centred above the bar: the box's middle is left of centre-height.
const barSpace = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-space")) || 0);
const middle = (900 - barSpace) / 2;
const inBox = { x: 800, y: Math.round(middle - 72) };
const boxPatch = () => patch(inBox.x - 50, inBox.y - 20, 100, 40);
const addedAt = { x: 900, y: Math.round(middle + 150) };
const addedPatch = () => patch(addedAt.x - 10, addedAt.y - 10, 300, 70);
const button = (name) => page.getByRole("button", { name, exact: true });

// ---- Additions are drawn on the canvas ----

const box0 = await boxPatch();
const empty = await addedPatch();
await page.keyboard.press("t");
await page.mouse.click(addedAt.x, addedAt.y);
await page.keyboard.type("added e2e");
await page.keyboard.press("Enter");
await settle();
const withAdded = await addedPatch();
check(!withAdded.equals(empty), "added text is drawn on the board");

// ---- Opacity, and Reset ----

await page.mouse.click(inBox.x, inBox.y);
await settle();
check(await page.isVisible("text=1 selected"), "clicking the box selects it");
await page.getByRole("slider").fill("20");
await settle();
check(!(await boxPatch()).equals(box0), "lowering its opacity redraws the box fainter");
check((await addedPatch()).equals(withAdded), "…and the added text is still drawn, unchanged");
await button("Reset").click();
await settle();
check((await boxPatch()).equals(box0), "Reset puts the box back as the board has it");

// ---- Copying ----

await page.keyboard.press("Escape");
await settle();
await page.mouse.move(300, 60);
await page.mouse.down();
await page.mouse.move(1400, Math.round(middle + 330), { steps: 10 });
await page.mouse.up();
await settle();
check(await page.isVisible("text=3 selected"), "dragging a box around everything selects all three");

await button("Copy text").click();
await settle();
const words = await page.evaluate(() => navigator.clipboard.readText());
check(words.includes("hello e2e") && words.includes("added e2e"), `Copy text copies the writing (“${words.replace(/\n/g, " / ")}”)`);

await button("Copy").click();
await settle();
const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
check(copied.type === "excalidraw/clipboard" && copied.elements.length === 3, `Copy copies the 3 elements for Excalidraw (${copied.elements?.length})`);

await button("Copy image").click();
await page.waitForTimeout(1000);
const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => item.types));
check(types.includes("image/png"), `Copy image copies a picture (${types.join(", ")})`);

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
