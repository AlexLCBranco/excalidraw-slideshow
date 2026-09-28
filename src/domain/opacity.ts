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

/** What an element is drawn at: its presenting opacity, else its own, else fully opaque. */
export const opacityOf = (e: { id: string; opacity?: number }, opacities: Opacities) =>
  opacities[e.id] ?? e.opacity ?? 100;
