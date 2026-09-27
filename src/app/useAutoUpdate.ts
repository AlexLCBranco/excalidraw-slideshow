import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Registers the offline service worker and switches to a newer version as
 * soon as one has downloaded, but only while `safe` (on the library): a
 * presentation is never reloaded. An update found mid-presentation is applied
 * on the way back to the library.
 */
export function useAutoUpdate(safe: boolean) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (needRefresh && safe) void updateServiceWorker(true);
  }, [needRefresh, safe, updateServiceWorker]);
}
