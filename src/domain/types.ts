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
