/**
 * Opacity set while presenting, per element id, from 0 to 100. It only
 * changes what is drawn on screen: it is never saved, and the board itself
 * keeps its own opacities.
 */
export type Opacities = Readonly<Record<string, number>>;

/** The elements with their presenting opacity applied. Untouched elements keep their identity. */
export function withOpacities<T extends { id: string; opacity?: number }>(elements: readonly T[], opacities: Opacities): T[] {
  return elements.map((e) => (e.id in opacities ? { ...e, opacity: opacities[e.id] } : e));
}

/**
 * What to draw each affected element at: 0 while hidden, else its presenting
 * opacity, else its own. Covers every element in `hideable` too, so an
 * element that is revealed again gets its opacity back.
 */
export function screenOpacities(
  elements: readonly { id: string; opacity?: number }[],
  opacities: Opacities,
  hideable: ReadonlySet<string>,
  hidden: ReadonlySet<string>,
): Opacities {
  const out: Record<string, number> = {};
  for (const e of elements) {
    if (hidden.has(e.id)) out[e.id] = 0;
    else if (e.id in opacities || hideable.has(e.id)) out[e.id] = opacityOf(e, opacities);
  }
  return out;
}

/** What an element is drawn at: its presenting opacity, else its own, else fully opaque. */
export const opacityOf = (e: { id: string; opacity?: number }, opacities: Opacities) =>
  opacities[e.id] ?? e.opacity ?? 100;
