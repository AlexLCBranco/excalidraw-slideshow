/**
 * The slice of Excalidraw's element shape this app reads. Declared here rather
 * than imported so `domain/` stays free of React and of the Excalidraw package.
 */
export interface SceneElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  points?: readonly (readonly [number, number])[];
  isDeleted?: boolean;
  frameId?: string | null;
  name?: string | null;
  // Links to other elements, renamed when boards are stacked (domain/group.ts).
  containerId?: string | null;
  groupIds?: readonly string[];
  boundElements?: readonly { id: string; type: string }[] | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  /** The embedded image an image element shows, a key into the board's `files`. */
  fileId?: string | null;
  /** Excalidraw's stacking-order key. */
  index?: string | null;
}

/** One slide: a rectangle of the canvas, in scene coordinates. */
export interface Page {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The frame's name, or "" for automatically found pages. */
  name: string;
  /** The frame this page came from, if any. */
  frameId?: string;
}
