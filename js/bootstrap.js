import { createStore } from "./state/store.js";
import { initInkmapServiceWorker } from "./print/inkmapInit.js";
import { createMapApp } from "./map/createMap.js";
import { bindUI } from "./ui/bindings.js";

// Register Inkmap worker as early as possible
initInkmapServiceWorker();

function readInitialUIState() {
  const orientation = document.getElementById("orientation")?.value || "landscape";
  const scale = document.getElementById("scale")?.value || "5000";
  const showPreview = document.getElementById("showPreview")?.checked ?? false;
  return { orientation, scale, showPreview };
}

function init() {
  // Prevent accidental double init
  if (window.__TRUEGIS_BOOTSTRAPPED__) return;
  window.__TRUEGIS_BOOTSTRAPPED__ = true;

  const { orientation, scale, showPreview } = readInitialUIState();

  const store = createStore({ orientation, scale, showPreview });
  const app = createMapApp({ store });

  bindUI({ app, store });

  // Handy debug access in DevTools
  window.TrueGIS = { app, store };

  // Optional: quick sanity log
  // console.log("[TrueGIS] bootstrapped", { orientation, scale, showPreview });
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    init();
  } catch (err) {
    console.error("❌ TrueGIS bootstrap failed:", err);
    alert("TrueGIS failed to start. Check the console for details.");
  }
});
