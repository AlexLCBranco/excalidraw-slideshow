import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_MS = 1800;

/** A one-line message that hides itself (after `ms`). Returns the current message (or null) and a setter. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((text: string, ms = TOAST_MS) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), ms);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return [message, show] as const;
}
