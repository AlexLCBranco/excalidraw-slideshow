import { useEffect, useRef } from "react";

interface Actions {
  next: () => void;
  previous: () => void;
  first: () => void;
  last: () => void;
  smaller: () => void;
  bigger: () => void;
  open: () => void;
  close: () => void;
}

const KEYS: Record<string, keyof Actions> = {
  ArrowRight: "next", ArrowDown: "next", PageDown: "next", " ": "next",
  ArrowLeft: "previous", ArrowUp: "previous", PageUp: "previous",
  Home: "first", End: "last",
  "-": "smaller", "=": "bigger", "+": "bigger",
  o: "open", O: "open",
  Escape: "close",
};

/**
 * Keyboard and mouse-wheel control for the slideshow. Listens in the capture
 * phase so Excalidraw never sees these keys (it would otherwise pan with the
 * arrows), and swallows the wheel so the camera can't drift off the page.
 */
export function useSlideKeys(enabled: boolean, actions: Actions) {
  // Read the latest actions from a ref, so the listener is attached once.
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const action = KEYS[e.key];
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current[action]();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [enabled]);
}
