/** A cell note placed on the board: the cell's box, in scene coordinates, and what it says. */
export interface BoardNote {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
}

/** The note whose cell is under scene point (x, y), if any. */
export const noteAt = (notes: readonly BoardNote[], x: number, y: number) =>
  notes.find((n) => x >= n.x0 && x < n.x1 && y >= n.y0 && y < n.y1);
