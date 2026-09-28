import { describe, expect, it } from "vitest";

import { addStep, hiddenIds, inSteps, removeFromSteps } from "./reveal";

describe("addStep", () => {
  it("appends a step, moving ids out of earlier steps and dropping emptied ones", () => {
    expect(addStep([["a", "b"], ["c"]], ["c", "d"])).toEqual([["a", "b"], ["c", "d"]]);
    expect(addStep([["a"]], ["a", "b"])).toEqual([["a", "b"]]);
  });
});

describe("removeFromSteps", () => {
  it("takes ids out and drops steps left empty", () => {
    expect(removeFromSteps([["a", "b"], ["c"]], ["b", "c"])).toEqual([["a"]]);
  });
});

describe("hiddenIds", () => {
  it("hides every step not yet revealed", () => {
    const steps = [["a"], ["b", "c"], ["d"]];
    expect([...hiddenIds(steps, 0)]).toEqual(["a", "b", "c", "d"]);
    expect([...hiddenIds(steps, 2)]).toEqual(["d"]);
    expect(hiddenIds(steps, 3).size).toBe(0);
  });
});

describe("inSteps", () => {
  it("says whether any id is in a step", () => {
    expect(inSteps([["a"]], ["x", "a"])).toBe(true);
    expect(inSteps([["a"]], ["x"])).toBe(false);
  });
});
