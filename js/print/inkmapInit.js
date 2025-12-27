export function initInkmapServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .register("inkmap-sw.js")
    .then(() => console.log("[inkmap] Service worker registered"))
    .catch((err) => console.warn("[inkmap] Service worker registration failed:", err));
}
