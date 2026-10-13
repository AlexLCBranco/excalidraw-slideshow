import { describe, expect, it } from "vitest";

import { type DragSignal, dropGroupName, extensionOf, fileKind, isFileDrag, nextDragDepth, planDrop } from "./drop";

describe("fileKind", () => {
  it("knows boards and workbooks, whatever the case", () => {
    expect(fileKind("talk.excalidraw")).toBe("board");
    expect(fileKind("TALK.Excalidraw")).toBe("board");
    expect(fileKind("scores.xlsx")).toBe("workbook");
  });

  it("refuses everything else, including look-alikes", () => {
    for (const name of ["notes.pdf", "board.excalidraw.png", "scene.json", "scores.xls", "excalidraw", "README"]) {
      expect(fileKind(name)).toBeNull();
    }
  });
});

describe("extensionOf", () => {
  it("is the last extension, lower-cased, or empty", () => {
    expect(extensionOf("Notes.PDF")).toBe(".pdf");
    expect(extensionOf("a.tar.gz")).toBe(".gz");
    expect(extensionOf("README")).toBe("");
    expect(extensionOf("folder.v2/README")).toBe("");
  });
});

describe("isFileDrag", () => {
  it("is true only when files are carried", () => {
    expect(isFileDrag(["Files"])).toBe(true);
    expect(isFileDrag(["text/plain", "text/uri-list"])).toBe(false);
    expect(isFileDrag([])).toBe(false);
  });
});

describe("planDrop", () => {
  it("opens a single board or workbook on its own", () => {
    expect(planDrop(["talk.excalidraw"])).toEqual({ open: "one", index: 0, note: "" });
    expect(planDrop(["scores.xlsx"])).toEqual({ open: "one", index: 0, note: "" });
  });

  it("says what it can't open, and opens nothing", () => {
    expect(planDrop(["notes.pdf"])).toEqual({ open: "nothing", note: "Can't open .pdf files" });
    expect(planDrop(["a.pdf", "b.PDF", "c.docx"]).note).toBe("Can't open .pdf or .docx files");
    expect(planDrop(["README"]).note).toBe("Can't open README");
    expect(planDrop(["a.pdf", "README"]).note).toBe("Can't open .pdf files or README");
  });

  it("does nothing, quietly, when no files were dropped", () => {
    expect(planDrop([])).toEqual({ open: "nothing", note: "" });
  });

  it("groups several boards in the order they were received", () => {
    expect(planDrop(["b.excalidraw", "a.excalidraw", "c.excalidraw"])).toEqual({ open: "group", indices: [0, 1, 2], note: "" });
  });

  it("opens the boards it can and names the rest", () => {
    expect(planDrop(["a.excalidraw", "x.pdf", "b.excalidraw"])).toEqual({
      open: "group",
      indices: [0, 2],
      note: "Can't open .pdf files",
    });
    expect(planDrop(["x.pdf", "a.excalidraw"])).toEqual({ open: "one", index: 1, note: "Can't open .pdf files" });
  });

  it("keeps workbooks out of groups", () => {
    expect(planDrop(["a.excalidraw", "s.xlsx", "b.excalidraw"])).toEqual({
      open: "group",
      indices: [0, 2],
      note: "Left out s.xlsx: workbooks play on their own, not in a group",
    });
    // Fewer than two drawings: the first file opens alone.
    expect(planDrop(["s.xlsx", "a.excalidraw"])).toEqual({
      open: "one",
      index: 0,
      note: "Left out a.excalidraw: workbooks play on their own, not in a group",
    });
    expect(planDrop(["s.xlsx", "t.xlsx", "x.pdf"]).note).toBe(
      "Can't open .pdf files · Left out t.xlsx: workbooks play on their own, not in a group",
    );
  });
});

describe("dropGroupName", () => {
  it("joins up to three names, then counts the rest", () => {
    expect(dropGroupName(["intro.excalidraw", "demo.excalidraw"])).toBe("intro + demo");
    expect(dropGroupName(["a.excalidraw", "b.excalidraw", "c.excalidraw"])).toBe("a + b + c");
    expect(dropGroupName(["a.excalidraw", "b.excalidraw", "c.excalidraw", "d.excalidraw"])).toBe("a + 3 more");
  });
});

describe("nextDragDepth", () => {
  const run = (signals: DragSignal[]) => {
    const seen: number[] = [];
    signals.reduce((depth, s) => (seen.push(nextDragDepth(depth, s)), seen.at(-1)!), 0);
    return seen;
  };

  it("never touches zero while moving between child elements (no flicker)", () => {
    // Into the window, onto a child, onto another child: each enter comes before the leave.
    expect(run(["enter", "enter", "leave", "enter", "leave"])).toEqual([1, 2, 1, 2, 1]);
  });

  it("reaches zero when the drag leaves the window", () => {
    expect(run(["enter", "enter", "leave", "leave"]).at(-1)).toBe(0);
  });

  it("hovering keeps it showing, without counting up", () => {
    expect(run(["over", "over"])).toEqual([1, 1]);
    expect(run(["enter", "enter", "over"]).at(-1)).toBe(2);
  });

  it("ends outright on drop, Esc or silence, and never goes negative", () => {
    expect(run(["enter", "enter", "end"]).at(-1)).toBe(0);
    expect(run(["leave", "leave"])).toEqual([0, 0]);
  });
});
