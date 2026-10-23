export const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "local";
export function shouldUpdate(
  current: string,
  remote: string,
  attempted: string | null,
  idle: boolean,
) {
  return idle && current !== "local" && !!remote && remote !== current && remote !== attempted;
}
export function watchAppUpdates() {
  let stopped = false;
  let checking = false;
  const check = async () => {
    if (checking || !navigator.onLine || document.visibilityState !== "visible") return;
    checking = true;
    try {
      const response = await fetch("/api/version", { cache: "no-store" });
      if (!response.ok) return;
      const { version } = await response.json();
      if (typeof version !== "string" || stopped) return;
      const key = "counter.update-attempt";
      if (version === appVersion) sessionStorage.removeItem(key);
      if (
        shouldUpdate(
          appVersion,
          version,
          sessionStorage.getItem(key),
          document.visibilityState === "visible" &&
            navigator.onLine &&
            !document.querySelector('[role="dialog"]'),
        )
      ) {
        sessionStorage.setItem(key, version);
        location.reload();
      }
    } catch {
      /* Offline use must remain available. */
    } finally {
      checking = false;
    }
  };
  const timer = setInterval(check, 60000);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  void check();
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", check);
  };
}
