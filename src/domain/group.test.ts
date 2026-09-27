import { describe, expect, it } from "vitest";

import { stackBoards } from "./group";
import { boardPages } from "./pages";
import type { Board } from "./scene";
import type { SceneElement } from "./types";

const rect = (id: string, y: number, height: number, extra: Partial<SceneElement> = {}): SceneElement => ({
  id, type: "rectangle", x: 0, y, width: 500, height, ...extra,
});
const board = (name: string, elements: SceneElement[], files: Record<string, unknown> = {}): Board => ({
  name, elements, files, background: "#fff",
});

describe("stackBoards", () => {
  it("places each board below the previous one, in order", () => {
    const group = stackBoards("talk", [board("a.excalidraw", [rect("r", 500, 100)]), board("b.excalidraw", [rect("r", -300, 200)])]);
    const [a, b] = group.elements;
    expect(a.y).toBe(0);
    expect(b.y).toBeGreaterThan(a.y + 100);
  });

  it("keeps every id unique, even when boards share them", () => {
    const shared = [rect("r", 0, 100), rect("t", 0, 10, { containerId: "r" })];
    const group = stackBoards("talk", [board("a", shared), board("b", shared)]);
    const ids = group.elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(4);
    expect(group.elements[3].containerId).toBe(ids[2]);
  });

  it("renames every link between elements", () => {
    const arrow = rect("arrow", 0, 10, {
      frameId: "f", groupIds: ["g"], startBinding: { elementId: "r" }, endBinding: null,
      boundElements: [{ id: "label", type: "text" }],
    });
    const [moved] = stackBoards("talk", [board("a", [arrow])]).elements;
    expect(moved).toMatchObject({
      frameId: "0:f", groupIds: ["0:g"], startBinding: { elementId: "0:r" }, endBinding: null,
      boundElements: [{ id: "0:label", type: "text" }],
    });
  });

  it("drops deleted elements and merges images", () => {
    const group = stackBoards("talk", [
      board("a", [rect("r", 0, 100), rect("gone", 9000, 100, { isDeleted: true })], { img1: {} }),
      board("b", [rect("r", 0, 100)], { img2: {} }),
    ]);
    expect(group.elements).toHaveLength(2);
    expect(Object.keys(group.files)).toEqual(["img1", "img2"]);
  });
});

describe("boardPages for a group", () => {
  it("finds pages board by board, named after their board", () => {
    const frame: SceneElement = { id: "f", type: "frame", x: 0, y: 0, width: 800, height: 600, name: "Intro" };
    const group = stackBoards("talk", [
      board("one.excalidraw", [frame, rect("inside", 10, 100, { frameId: "f" })]),
      board("two.excalidraw", [rect("a", 0, 900), rect("b", 1100, 900)]),
    ]);
    const pages = boardPages(group, 1000);
    expect(pages.map((p) => p.name)).toEqual(["Intro", "two", "two"]);
    // Reading order holds across boards.
    expect(pages[1].y0).toBeGreaterThan(pages[0].y1);
  });
});
