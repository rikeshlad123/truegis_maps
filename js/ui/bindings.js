import { $ } from "../utils/dom.js";
import { nominatimSearch } from "../services/geocode.js";
import { centerOnUserLocation } from "../services/location.js";
import { inkmapPrint } from "../print/inkmapPrint.js";
import { buildInkmapSpec } from "../print/spec.js";
import { exportGeoJSON, importGeoJSONFile } from "../data/geojson.js";

function bindClick(id, handler, { required = false } = {}) {
  const el = $(id);
  if (!el) {
    if (required) {
      console.error(`[ui] Missing element #${id}. This is required for the current UI.`);
    }
    return null;
  }
  el.onclick = handler;
  return el;
}

function setDisabled(id, disabled) {
  const el = $(id);
  if (el) el.disabled = !!disabled;
}

// Small debounce helper to avoid spamming history snapshots on slider drag
function debounce(fn, wait = 150) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function isTypingTarget(e) {
  const target = e.target;
  const tag = target?.tagName?.toLowerCase?.();
  return tag === "input" || tag === "textarea" || target?.isContentEditable;
}

export function bindUI({ app, store }) {
  const mapEl = document.getElementById("map");

  const getStyleProps = () => ({
    fillColor: $("#fillColor")?.value || "#ff0000",
    fillOpacity: parseFloat($("#fillOpacity")?.value ?? "0.4"),
    strokeColor: $("#strokeColor")?.value || "#000000",
    strokeOpacity: parseFloat($("#strokeOpacity")?.value ?? "1"),
    strokeWidth: parseInt($("#strokeWidth")?.value ?? "2", 10),
  });

  const syncHistoryButtons = () => {
    setDisabled("undoBtn", !app.history?.canUndo?.());
    setDisabled("redoBtn", !app.history?.canRedo?.());
  };

  // Commit change = snapshot + autosave
  const afterUserChange = () => {
    app.preview?.update?.();
    app.snapshotAndAutosave?.();
    syncHistoryButtons();
  };

  // After undo/redo: NO snapshot (or redo dies)
  const afterUndoRedo = () => {
    app.preview?.update?.();
    app.autosaveCurrentStateOnly?.();
    syncHistoryButtons();
  };

  const commitSelectedStyle = () => {
    const selected = app.edit?.getSelectedFeatures?.() ?? [];
    if (!selected.length) return;
    app.edit.applyStyleToSelected(getStyleProps(), app.draw.styleFeature);
    afterUserChange();
  };

  const commitSelectedStyleDebounced = debounce(commitSelectedStyle, 200);

  const MODE_BUTTON_IDS = [
    "selectMode",
    "drawPoint",
    "drawLine",
    "drawPolygon",
    "drawCircle",
    "drawSquare",
    "drawRectangle",
    "measureLine",
    "measureArea",
  ];

  const setModeActive = (id) => {
    for (const bid of MODE_BUTTON_IDS) {
      $("#" + bid)?.classList.remove("mode-active");
    }
    if (id) $("#" + id)?.classList.add("mode-active");
  };

  function disableMeasure() {
    if (app.measure?.getMode?.() != null) {
      app.measure.setMode(null);
    }
  }

  function enableMeasure(mode, buttonId) {
    app.draw?.deactivate?.();
    app.edit?.clearSelection?.();
    app.measure?.setMode?.(mode);
    setModeActive(buttonId);
  }

  // Track whether map was the last active context.
  // This prevents Ctrl+Z from hijacking the whole page.
  let mapContextActive = false;

  mapEl?.addEventListener("pointerdown", () => {
    mapContextActive = true;
  });

  // If the user clicks anywhere outside the map, release map context.
  document.addEventListener("pointerdown", (e) => {
    if (!mapEl) return;
    if (mapEl.contains(e.target)) return;
    mapContextActive = false;
  });

  // --- DRAW / SELECT ---
  bindClick("selectMode", () => {
    disableMeasure();
    app.draw.deactivate?.();
    app.edit?.clearSelection?.();
    setModeActive("selectMode");
  });

  bindClick("drawPoint", () => { disableMeasure(); app.draw.activate("Point", getStyleProps); setModeActive("drawPoint"); });
  bindClick("drawLine", () => { disableMeasure(); app.draw.activate("LineString", getStyleProps); setModeActive("drawLine"); });
  bindClick("drawPolygon", () => { disableMeasure(); app.draw.activate("Polygon", getStyleProps); setModeActive("drawPolygon"); });
  bindClick("drawCircle", () => { disableMeasure(); app.draw.activate("Circle", getStyleProps); setModeActive("drawCircle"); });
  bindClick("drawSquare", () => { disableMeasure(); app.draw.activate("Square", getStyleProps); setModeActive("drawSquare"); });

  bindClick("drawRectangle", () => {
    disableMeasure();
    app.draw.activate("Rectangle", getStyleProps);
    setModeActive("drawRectangle");
  }, { required: false });

  bindClick("measureLine", () => enableMeasure("line", "measureLine"), { required: false });
  bindClick("measureArea", () => enableMeasure("area", "measureArea"), { required: false });
  bindClick("clearMeasure", () => app.measure?.clear?.(), { required: false });

  bindClick("clearDrawings", () => {
    if (!confirm("Clear all drawings?")) return;
    disableMeasure();
    app.edit?.clearSelection?.();
    app.draw.clear();
    app.draw.deactivate?.();
    setModeActive("selectMode");
    afterUserChange();
  });

  bindClick("deleteSelectedBtn", () => {
    const n = app.edit?.deleteSelected?.() ?? 0;
    if (n) afterUserChange();
  });

  ["fillColor", "fillOpacity", "strokeColor", "strokeOpacity", "strokeWidth"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => commitSelectedStyleDebounced());
    el.addEventListener("change", () => commitSelectedStyle());
  });

  // --- UNDO / REDO handlers ---
  const undoBtn = bindClick("undoBtn", () => {
    if (app.history?.undo?.()) {
      disableMeasure();
      app.edit?.clearSelection?.();
      afterUndoRedo();
    }
  }, { required: false });

  const redoBtn = bindClick("redoBtn", () => {
    if (app.history?.redo?.()) {
      disableMeasure();
      app.edit?.clearSelection?.();
      afterUndoRedo();
    }
  }, { required: false });

  // ✅ Keyboard shortcuts: only when map was last active, and route through button click.
  window.addEventListener("keydown", (e) => {
    const isMac = navigator.platform?.toLowerCase?.().includes("mac");
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;

    if (isTypingTarget(e)) return;

    // Only handle if map context is active (user last interacted with map)
    if (!mapContextActive) return;

    const key = (e.key || "").toLowerCase();

    if (key === "z" && !e.shiftKey) {
      if (undoBtn && !undoBtn.disabled) {
        undoBtn.click();
        e.preventDefault();
      }
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      if (redoBtn && !redoBtn.disabled) {
        redoBtn.click();
        e.preventDefault();
      }
    }
  });

  // --- PRINT PREVIEW ---
  $("#scale")?.addEventListener("change", () => { store.setState({ scale: $("#scale").value }); afterUserChange(); });
  $("#orientation")?.addEventListener("change", () => { store.setState({ orientation: $("#orientation").value }); afterUserChange(); });
  $("#showPreview")?.addEventListener("change", () => { store.setState({ showPreview: !!$("#showPreview").checked }); afterUserChange(); });

  // --- SEARCH ---
  bindClick("locateBtn", () => centerOnUserLocation({ view: app.view }), { required: false });

  bindClick("searchBtn", async () => {
    const q = ($("#searchInput")?.value || "").trim();
    if (!q) return alert("Enter a place to search");

    try {
      const hit = await nominatimSearch(q);
      if (!hit) return alert("No results found");
      const lon = parseFloat(hit.lon);
      const lat = parseFloat(hit.lat);
      app.view.setCenter(ol.proj.fromLonLat([lon, lat]));
      app.view.setZoom(15);
    } catch (e) {
      console.error(e);
      alert("Search failed. See console.");
    }
  }, { required: false });

  // --- QUICK PRINT ---
  bindClick("quickPrint", () => {
    const isOSM = app.layers.osmLayer?.getVisible?.() ?? true;
    if (!isOSM) return alert("Quick Print only works with OSM.");

    const canvas = app.map.getViewport().querySelector("canvas");
    if (!canvas) return alert("Canvas not available.");

    const url = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    win.document.write(`<img src="${url}" style="max-width:100%;" />`);
  }, { required: false });

  // --- GEOJSON ---
  bindClick("importGeoJSON", () => $("#geojsonFile")?.click(), { required: false });

  $("#geojsonFile")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await importGeoJSONFile({
      file,
      vectorSource: app.vectorSource,
      applyStyle: app.draw.styleFeature,
    });

    e.target.value = "";
    disableMeasure();
    app.edit?.clearSelection?.();
    app.draw.deactivate?.();
    setModeActive("selectMode");
    afterUserChange();
  });

  bindClick("exportGeoJSON", () => {
    const text = exportGeoJSON({ vectorSource: app.vectorSource });
    const blob = new Blob([text], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "truegis-drawings.geojson";
    a.click();
  });

  // --- PRINT ---
  bindClick("print", async () => {
    const btn = $("#print");
    try {
      if (btn) btn.disabled = true;
      const spec = buildInkmapSpec({ app, store });
      await inkmapPrint(spec);
    } catch (e) {
      console.error("❌ Inkmap error:", e);
      alert("Print failed.");
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // initial
  app.preview?.update?.();
  syncHistoryButtons();
  setModeActive("selectMode");
}
