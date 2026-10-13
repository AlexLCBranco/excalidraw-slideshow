// End-to-end check of adding text and pictures to a board, in headless Edge.
//
//   npm run e2e:add                          against the live site
//   npm run e2e:add -- http://localhost:5180 against the dev server
//
// Drops a throwaway two-page board made here (never one of the owner's), then:
// adds text with T, a picture through the file picker and one by pasting, moves
// one, checks every "are you sure?" (remove, discard, save, leaving unsaved),
// that ←/→ still page with additions on screen, and that saved additions come
// back when the board is opened again. It runs in a fresh browser profile, so
// whatever it saves is gone when it ends.
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://excalidraw-slideshow.vercel.app";
const NAME = "e2e-additions.excalidraw";

/** Two pages, 1000 units apart, each with a rectangle. */
const rect = (id, y) => ({
  id, type: "rectangle", x: 0, y, width: 1600, height: 800, angle: 0, strokeColor: "#1e1e1e",
  backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1,
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
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE).origin });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const dropBoard = async () => {
  await page.evaluate(([text, name]) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], name));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, cancelable: true }));
  }, [BOARD, NAME]);
  await page.waitForSelector("text=1 / 2", { timeout: 30_000 });
  await page.waitForTimeout(800);
};
const added = () => page.locator('[data-testid="added"]').count();
const dialog = page.getByRole("alertdialog");
const pageCounter = () => page.locator("button", { hasText: /^\d+ \/ 2$/ }).first().innerText();

await page.goto(BASE);
await page.waitForSelector("text=Open a file");
// A small red PNG, drawn by the browser.
const PNG = await page.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = 200;
  c.height = 100;
  const g = c.getContext("2d");
  g.fillStyle = "red";
  g.fillRect(0, 0, 200, 100);
  return c.toDataURL("image/png").split(",")[1];
});
await dropBoard();

// Text: T, click, type, Enter.
await page.keyboard.press("t");
await page.mouse.click(400, 300);
await page.keyboard.type("Hello from e2e");
await page.keyboard.press("Enter");
check((await added()) === 1, "T, click, type and Enter adds text, marked “Added”");
check(await page.getByText("Unsaved changes").isVisible(), "the Save changes bar appears");

// Typing doesn't trigger shortcuts: g would open the page grid.
await page.keyboard.press("t");
await page.mouse.click(400, 500);
await page.keyboard.type("go");
check(!(await page.getByRole("dialog", { name: /pages/i }).count()), "typing g in text doesn't open the page grid");
await page.keyboard.press("Escape");
check((await added()) === 1, "Esc while typing adds nothing");

// A picture through the file picker, and one pasted.
await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: "red.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
await page.waitForFunction(() => document.querySelectorAll('[data-testid="added"]').length === 2);
check(true, "a picture from the file picker is added");
await page.evaluate(async (b64) => {
  const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const transfer = new DataTransfer();
  transfer.items.add(new File([data], "pasted.png", { type: "image/png" }));
  document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
}, PNG);
await page.waitForFunction(() => document.querySelectorAll('[data-testid="added"]').length === 3);
check(true, "a pasted picture is added");

// Moving by the tag.
const tag = page.locator('[data-testid="added"]').first().getByText("Added");
const before = await page.locator('[data-testid="added"]').first().boundingBox();
const t = await tag.boundingBox();
await page.mouse.move(t.x + 10, t.y + 5);
await page.mouse.down();
await page.mouse.move(t.x + 110, t.y + 55, { steps: 5 });
await page.mouse.up();
const after = await page.locator('[data-testid="added"]').first().boundingBox();
check(Math.abs(after.x - before.x - 100) < 3 && Math.abs(after.y - before.y - 50) < 3, "dragging the “Added” tag moves it");

// Remove asks first; Cancel keeps it.
await page.locator('[data-testid="added"]').nth(2).getByRole("button", { name: "Remove" }).click();
check(await dialog.getByText("Remove this added picture?").isVisible(), "× asks “Remove this added picture?”");
await dialog.getByRole("button", { name: "Cancel" }).click();
check((await added()) === 3, "Cancel keeps it");
await page.locator('[data-testid="added"]').nth(2).getByRole("button", { name: "Remove" }).click();
await dialog.getByRole("button", { name: "Remove" }).click();
check((await added()) === 2, "Remove takes it away");

// ←/→ still page with additions on screen.
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
check((await pageCounter()) === "2 / 2", "→ goes to page 2 with additions on the board");
check((await added()) === 2, "additions are still marked after paging");
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(300);
check((await pageCounter()) === "1 / 2", "← goes back to page 1");

// Leaving with unsaved changes asks; Cancel stays.
await page.keyboard.press("Escape");
check(await dialog.getByText("Save your changes before leaving?").isVisible(), "Esc with unsaved changes asks before leaving");
await page.keyboard.press("Escape");
check(!(await dialog.count()) && (await pageCounter()) === "1 / 2", "Esc on the question cancels and stays on the board");

// Save asks first, then saves.
await page.getByRole("button", { name: "Save changes" }).click();
check(await dialog.getByText("Save your changes?").isVisible(), "Save changes asks “Save your changes?”");
await dialog.getByRole("button", { name: "Save changes" }).click();
await page.waitForSelector("text=Unsaved changes", { state: "detached" });
check(true, "after saving, the Save changes bar goes away");

// Discard asks first and goes back to what was saved.
await page.keyboard.press("t");
await page.mouse.click(400, 600);
await page.keyboard.type("not kept");
await page.keyboard.press("Enter");
check((await added()) === 3, "a third addition, unsaved");
await page.getByRole("button", { name: "Discard" }).click();
check(await dialog.getByText("Discard your changes?").isVisible(), "Discard asks “Discard your changes?”");
await dialog.getByRole("button", { name: "Discard" }).click();
check((await added()) === 2, "Discard goes back to the saved two");

// Leaving with nothing unsaved doesn't ask; opening the board again brings the saved additions back.
await page.keyboard.press("Escape");
await page.waitForSelector("text=Open a file");
check(true, "Esc with everything saved leaves without asking");
await dropBoard();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="added"]').length === 2);
check(await page.getByText("Unsaved changes").count() === 0, "reopened: the two saved additions are back, nothing unsaved");

// Clean up: remove both and save, so nothing is left in this (throwaway) profile either.
for (let i = 0; i < 2; i++) {
  await page.locator('[data-testid="added"]').first().getByRole("button", { name: "Remove" }).click();
  await dialog.getByRole("button", { name: "Remove" }).click();
}
await page.getByRole("button", { name: "Save changes" }).click();
await dialog.getByRole("button", { name: "Save changes" }).click();
await page.waitForSelector("text=Unsaved changes", { state: "detached" });
check((await added()) === 0, "cleaned up");

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
