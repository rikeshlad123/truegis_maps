import { initDrawTools } from "./drawTools.js";
import { initPreviewBox } from "./previewBox.js";
import { initEditTools } from "./editTools.js";
import { initMeasureTools } from "./measureTools.js";
import { createHistory } from "../state/history.js";
import { loadAutosave, saveAutosave } from "../state/autosave.js";
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
   * ✅ Autosave should always reflect the REAL source-of-truth (vectorSource),
   * not whatever history thinks is current.
   *
   * This makes refresh/import/export stable even if history stacks get out of sync.
   */
  function autosaveCurrentStateOnly() {
    try {
      const text = exportGeoJSON({ vectorSource });
      // Always save, even if empty (clearing drawings should persist)
      saveAutosave(text);
    } catch (e) {
      console.warn("[autosave] Failed:", e);
    }
  }

  /**
   * Commit: snapshot + autosave.
   * Call ONLY after real user edits (drawend/modifyend/style change/delete/import/clear).
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

  // restore autosave (if any)
  const saved = loadAutosave();
  if (saved) {
    history.withSuspend(() => {
      vectorSource.clear(true);
      importGeoJSONText({ text: saved, vectorSource, applyStyle: draw.styleFeature });
    });

    // After restore, baseline should be the restored state (so undo doesn't jump to empty)
    history.resetBaselineFromCurrent();
    preview.update();
    autosaveCurrentStateOnly();
  }

  // Extra safety: make sure we persist on navigation/refresh even if something didn’t trigger onChange
  window.addEventListener("beforeunload", () => {
    autosaveCurrentStateOnly();
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
    snapshotAndAutosave, // commit changes
    autosaveCurrentStateOnly, // keep autosave in sync after undo/redo
  };
}
