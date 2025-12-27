import { CONFIG } from "./config.js";
import { createStore } from "./state/store.js";
import { initInkmapServiceWorker } from "./print/inkmapInit.js";
import { createMapApp } from "./map/createMap.js";
import { bindUI } from "./ui/bindings.js";

initInkmapServiceWorker();

window.addEventListener("load", () => {
  // Seed state from DOM (so existing UI defaults still drive behaviour)
  const orientation = document.getElementById("orientation")?.value || "landscape";
  const scale = document.getElementById("scale")?.value || "5000";
  const showPreview = document.getElementById("showPreview")?.checked ?? true;

  const store = createStore({
    orientation,
    scale,
    showPreview
  });

  const app = createMapApp({ store });
  bindUI({ app, store });

  // Optional: debugging handle
  window.TrueGIS = app;
});
