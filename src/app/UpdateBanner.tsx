import { useRegisterSW } from "virtual:pwa-register/react";

import styles from "./UpdateBanner.module.css";

/**
 * Registers the offline service worker, and offers a newer version once one
 * has downloaded. The app never reloads by itself, so it stays `hidden`
 * during a presentation and appears back on the library.
 */
export function UpdateBanner({ hidden = false }: { hidden?: boolean }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh || hidden) return null;
  return (
    <div className={styles.banner} role="status">
      A new version is ready.
      <button onClick={() => void updateServiceWorker(true)}>Update now</button>
    </div>
  );
}
