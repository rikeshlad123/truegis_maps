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

// Prevent browser-native undo/redo from hijacking Ctrl+Z/Ctrl+Y on the page.
// Your app decides what undo/redo means. We only allow it when the map is the active context.
// (bindUI also scopes shortcuts, but this is a final safety net at the document level.)
function installUndoRedoGuard() {
  document.addEventListener(
    "keydown",
    (e) => {
      const isMac = navigator.platform?.toLowerCase?.().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      const key = (e.key || "").toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;

      const target = e.target;
      const tag = target?.tagName?.toLowerCase?.();
      const isTyping = tag === "input" || tag === "textarea" || target?.isContentEditable;
      if (isTyping) return;

      // If the focused/active element is inside the map, stop browser/page undo.
      // bindUI will handle it (and route through undoBtn/redoBtn).
      const mapEl = document.getElementById("map");
      if (mapEl && (document.activeElement === mapEl || mapEl.contains(document.activeElement))) {
        e.preventDefault();
      }
    },
    { capture: true } // capture ensures we beat browser/page-level handlers
  );
}

function init() {
  // Prevent accidental double init
  if (window.__TRUEGIS_BOOTSTRAPPED__) return;
  window.__TRUEGIS_BOOTSTRAPPED__ = true;

  installUndoRedoGuard();

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
