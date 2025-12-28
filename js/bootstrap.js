import { createStore } from "./state/store.js";
import { initInkmapServiceWorker } from "./print/inkmapInit.js";
import { createMapApp } from "./map/createMap.js";
import { bindUI } from "./ui/bindings.js";

initInkmapServiceWorker();

window.addEventListener("load", () => {
  const orientation = document.getElementById("orientation")?.value || "landscape";
  const scale = document.getElementById("scale")?.value || "5000";
  const showPreview = document.getElementById("showPreview")?.checked ?? false;

  const store = createStore({ orientation, scale, showPreview });

  const app = createMapApp({ store });
  bindUI({ app, store });

  window.TrueGIS = app;
});
