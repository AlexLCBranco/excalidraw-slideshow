import { useEffect, useState } from "react";

const IDLE_MS = 2500;
/** How close to the bottom edge counts as "reaching for the control bar", in px. */
const BOTTOM_ZONE = 120;

/**
 * Tracks the mouse for the auto-hiding control bar: `moving` is true for a
 * few seconds after it moves, `nearBottom` while it's close to the bottom edge.
 */
export function usePointerActivity() {
  const [moving, setMoving] = useState(false);
  const [nearBottom, setNearBottom] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = (e: PointerEvent) => {
      setMoving(true);
      setNearBottom(window.innerHeight - e.clientY < BOTTOM_ZONE);
      clearTimeout(timer);
      timer = setTimeout(() => setMoving(false), IDLE_MS);
    };
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
    };
  }, []);
  return { moving, nearBottom };
}
