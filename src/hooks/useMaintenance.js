import { useCallback, useMemo } from "react";

/**
 * Client for the app-scoped maintenance bridge.
 *
 * The bridge is optional: in a plain browser preview there is no Electron main
 * process, so every call fails closed instead of inventing a cleanup result.
 */
function bridge() {
  if (typeof window === "undefined") return null;
  return window.electronAPI?.maintenance || null;
}

const UNAVAILABLE = Object.freeze({
  ok: false,
  error: { code: "UNAVAILABLE", message: "System Care needs the desktop app." },
});

export function useMaintenance() {
  const api = useMemo(bridge, []);
  const available = !!api;
  const info = useCallback(() => (api ? api.info() : UNAVAILABLE), [api]);
  const scan = useCallback(() => (api ? api.scan() : UNAVAILABLE), [api]);
  const clean = useCallback(
    (confirm) => (api ? api.clean(confirm === true) : UNAVAILABLE),
    [api],
  );
  const openPanel = useCallback(
    (panel) => (api ? api.openPanel(panel) : UNAVAILABLE),
    [api],
  );
  return { available, info, scan, clean, openPanel };
}

export default useMaintenance;
