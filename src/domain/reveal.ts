/**
 * Reveal steps: parts of a page that start hidden and appear one per →.
 * A page's steps are lists of element ids, in the order they appear.
 */
export type Steps = readonly (readonly string[])[];

/** Steps with a new last step made of `ids`. Ids already in an earlier step move to the new one. */
export function addStep(steps: Steps, ids: readonly string[]): string[][] {
  return [...removeFromSteps(steps, ids), [...ids]];
}

/** Steps without `ids`. A step left empty is dropped. */
export function removeFromSteps(steps: Steps, ids: readonly string[]): string[][] {
  const out = new Set(ids);
  return steps.map((step) => step.filter((id) => !out.has(id))).filter((step) => step.length);
}

/** The elements still hidden once `revealed` steps have been shown. */
export const hiddenIds = (steps: Steps, revealed: number): Set<string> => new Set(steps.slice(revealed).flat());

/** Whether any of `ids` is in a step. */
export const inSteps = (steps: Steps, ids: readonly string[]) => steps.some((step) => step.some((id) => ids.includes(id)));
