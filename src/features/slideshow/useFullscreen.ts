import { useCallback, useEffect, useState } from "react";

/** Whether the page is full screen, and a toggle. F11 full screen is the browser's own and isn't seen here. */
export function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);
  return [fullscreen, toggle] as const;
}
