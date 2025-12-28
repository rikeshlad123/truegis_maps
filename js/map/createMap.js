import { initDrawTools } from "./drawTools.js";
import { initPreviewBox } from "./previewBox.js";
import { initEditTools } from "./editTools.js";
import { createHistory } from "../state/history.js";
import { loadAutosave, saveAutosave } from "../state/autosave.js";
import { importGeoJSONText } from "../data/geojson.js";
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
  });

  const preview = initPreviewBox({ map, vectorSource, store });

  // history created after draw (needs draw.styleFeature)
  let history = null;

  function snapshotAndAutosave() {
    if (!history) return;
    history.snapshot();
    const latest = history._debug.undoStack[history._debug.undoStack.length - 1];
    if (latest) saveAutosave(latest);
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

  // baseline snapshot (empty)
  history.resetBaselineFromCurrent();

  // restore autosave (if any)
  const saved = loadAutosave();
  if (saved) {
    history.withSuspend(() => {
      vectorSource.clear(true);
      importGeoJSONText({ text: saved, vectorSource, applyStyle: draw.styleFeature });
    });
    history.resetBaselineFromCurrent();
    preview.update();
  }

  centerOnUserLocation({ view });

  return {
    map,
    view,
    vectorSource,
    layers: { osmLayer, esriLayer, vectorLayer },
    draw,
    edit,
    preview,
    history,
    snapshotAndAutosave,
  };
}
