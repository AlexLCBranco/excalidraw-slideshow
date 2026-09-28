import { describe, expect, it } from "vitest";

import { opacityOf, screenOpacities, withOpacities } from "./opacity";

describe("withOpacities", () => {
  it("changes only the listed elements and leaves the others as they were", () => {
    const a = { id: "a", opacity: 100 };
    const b = { id: "b", opacity: 60 };
    const [a2, b2] = withOpacities([a, b], { a: 30 });
    expect(a2).toEqual({ id: "a", opacity: 30 });
    expect(a).toEqual({ id: "a", opacity: 100 });
    expect(b2).toBe(b);
  });
});

describe("screenOpacities", () => {
  it("hides, restores revealed elements to their opacity, and leaves the rest out", () => {
    const els = [{ id: "hidden" }, { id: "revealed", opacity: 70 }, { id: "faded" }, { id: "plain" }];
    const hideable = new Set(["hidden", "revealed"]);
    expect(screenOpacities(els, { faded: 20 }, hideable, new Set(["hidden"]))).toEqual({
      hidden: 0,
      revealed: 70,
      faded: 20,
    });
  });
});

describe("opacityOf", () => {
  it("prefers the presenting opacity, then the element's own, then fully opaque", () => {
    expect(opacityOf({ id: "a", opacity: 60 }, { a: 20 })).toBe(20);
    expect(opacityOf({ id: "a", opacity: 60 }, {})).toBe(60);
    expect(opacityOf({ id: "a" }, {})).toBe(100);
  });
});
