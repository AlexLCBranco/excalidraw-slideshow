import { useEffect, useRef } from "react";

// The File Handling API (installed apps in Edge and Chrome) isn't in TypeScript's DOM types yet.
declare global {
  interface Window {
    launchQueue?: { setConsumer: (consumer: (params: { files: readonly FileSystemFileHandle[] }) => void) => void };
  }
}

/**
 * Boards opened from File Explorer ("Open with" > Excalidraw Slideshow, or a
 * double-click once it's the default app) arrive here, once the app is installed.
 */
export function useLaunchFiles(onFile: (handle: FileSystemFileHandle) => void) {
  // The browser hands over the launch files once, to the first consumer set, so
  // the consumer is set once and always calls the latest `onFile`.
  const latest = useRef(onFile);
  useEffect(() => {
    latest.current = onFile;
  });

  useEffect(() => {
    window.launchQueue?.setConsumer(({ files }) => files[0] && latest.current(files[0]));
  }, []);
}
