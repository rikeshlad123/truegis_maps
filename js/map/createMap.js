import { initDrawTools } from "./drawTools.js";
import { initPreviewBox } from "./previewBox.js";
import { initEditTools } from "./editTools.js";
import { initMeasureTools } from "./measureTools.js";
import { createHistory } from "../state/history.js";
import { loadAutosave, loadAutosaveFallback, saveAutosave } from "../state/autosave.js";
import { exportGeoJSON, importGeoJSONText } from "../data/geojson.js";
import { centerOnUserLocation } from "../services/location.js";

/**
 * Creates the TrueGIS Maps engine.
 * Owns map/layers + drawing/editing + history/autosave.
 */
export function createMapApp({ store }) {
  const vectorSource = new ol.source.Vector();
  const vectorLayer = new ol.layer.Vector({ source: vectorSource });

  const osmLayer = new ol.layer.Tile({
    source: new ol.source.OSM(),
    visible: true,
  });

  const esriLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    }),
    visible: false,
  });

  const view = new ol.View({
    center: ol.proj.fromLonLat([-1.9, 52.48]),
    zoom: 12,
  });

  const map = new ol.Map({
    target: "map",
    layers: [osmLayer, esriLayer, vectorLayer],
    view,
    rendererOptions: {
      willReadFrequently: true,
    },
  });

  // Fullscreen control (built-in)
  try {
    if (ol.control?.FullScreen) {
      map.addControl(new ol.control.FullScreen());
    }
  } catch (e) {
    console.warn("[map] FullScreen control unavailable:", e);
  }

  const preview = initPreviewBox({ map, vectorSource, store });

  // history created after draw (needs draw.styleFeature)
  let history = null;

  /**
   * Autosave should reflect the actual vectorSource (source-of-truth),
   * not a history stack pointer.
   */
  function autosaveCurrentStateOnly() {
    try {
      const text = exportGeoJSON({ vectorSource });
      saveAutosave(text);
    } catch (e) {
      console.warn("[autosave] Failed:", e);
    }
  }

  /**
   * Commit: snapshot + autosave.
   * Call ONLY after real edits (drawend/modifyend/style change/delete/import/clear).
   */
  function snapshotAndAutosave() {
    if (history) {
      if (typeof history.snapshotNow === "function") history.snapshotNow();
      else history.snapshot();
    }
    autosaveCurrentStateOnly();
  }

  const onUserChange = () => {
    preview.update();
    snapshotAndAutosave();
  };

  const draw = initDrawTools({ map, vectorSource, onChange: onUserChange });

  history = createHistory({
    vectorSource,
    applyStyle: draw.styleFeature,
  });

  const edit = initEditTools({ map, vectorSource, onChange: onUserChange });

  // Measure tools (separate layer + interactions)
  const measure = initMeasureTools({ map });

  // baseline snapshot (empty)
  history.resetBaselineFromCurrent();
  autosaveCurrentStateOnly();

  // restore autosave (if any) — localStorage first, then sessionStorage fallback
  const saved = loadAutosave() ?? loadAutosaveFallback?.() ?? null;
  if (saved) {
    history.withSuspend(() => {
      vectorSource.clear(true);
      importGeoJSONText({ text: saved, vectorSource, applyStyle: draw.styleFeature });
    });

    // baseline becomes restored state
    history.resetBaselineFromCurrent();
    preview.update();
    autosaveCurrentStateOnly();
  }

  /**
   * Keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Y (or Cmd+Shift+Z) redo.
   * IMPORTANT: After undo/redo we DO NOT snapshot (or redo gets wiped).
   */
  window.addEventListener("keydown", (e) => {
    const isMac = navigator.platform?.toLowerCase?.().includes("mac");
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;

    const key = (e.key || "").toLowerCase();

    // Avoid interfering with typing in inputs
    const target = e.target;
    const tag = target?.tagName?.toLowerCase?.();
    const isTyping = tag === "input" || tag === "textarea" || target?.isContentEditable;
    if (isTyping) return;

    if (key === "z" && !e.shiftKey) {
      if (history?.undo?.()) {
        edit?.clearSelection?.();
        preview.update();
        autosaveCurrentStateOnly();
      }
      e.preventDefault();
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      if (history?.redo?.()) {
        edit?.clearSelection?.();
        preview.update();
        autosaveCurrentStateOnly();
      }
      e.preventDefault();
    }
  });

  // Extra safety: persist on refresh/navigation + tab hide/freeze
  window.addEventListener("beforeunload", () => {
    autosaveCurrentStateOnly();
  });

  window.addEventListener("pagehide", () => {
    autosaveCurrentStateOnly();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      autosaveCurrentStateOnly();
    }
  });

  centerOnUserLocation({ view });

  return {
    map,
    view,
    vectorSource,
    layers: { osmLayer, esriLayer, vectorLayer },
    draw,
    edit,
    measure,
    preview,
    history,
    snapshotAndAutosave,
    autosaveCurrentStateOnly,
  };
}
