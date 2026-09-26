import { useEffect, useRef } from "react";

import styles from "./LaserPointer.module.css";

/** How long the trail behind the pointer lasts, in ms. */
const TRAIL_MS = 500;

/**
 * A red dot with a short fading trail that follows the mouse. Drawn by the
 * app rather than Excalidraw, whose own laser can't run in view mode (every
 * drag there pans). It also sits over the canvas, so pointing never pans.
 */
export function LaserPointer() {
  const trailRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const points = useRef<{ x: number; y: number; t: number }[]>([]);

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const now = performance.now();
      points.current = points.current.filter((p) => now - p.t < TRAIL_MS);
      const d = points.current.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join("");
      trailRef.current?.setAttribute("d", d);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const onMove = (e: React.PointerEvent) => {
    points.current.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    dotRef.current?.setAttribute("cx", String(e.clientX));
    dotRef.current?.setAttribute("cy", String(e.clientY));
  };

  return (
    <svg className={styles.layer} onPointerMove={onMove}>
      <path ref={trailRef} className={styles.trail} />
      <circle ref={dotRef} className={styles.dot} cx={-100} cy={-100} />
    </svg>
  );
}
