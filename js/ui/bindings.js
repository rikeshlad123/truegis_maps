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

export function bindUI({ app, store }) {
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

  const afterUserChange = () => {
    app.preview?.update?.();
    app.snapshotAndAutosave?.();
    syncHistoryButtons();
  };

  // Apply current style controls to selected features (persist + restyle)
  // This is the "commit" that makes changes stick after deselect/export/refresh.
  const commitSelectedStyle = () => {
    const selected = app.edit?.getSelectedFeatures?.() ?? [];
    if (!selected.length) return;
    app.edit.applyStyleToSelected(getStyleProps(), app.draw.styleFeature);
    afterUserChange();
  };

  // Debounced commit for slider/text input drag (prevents undo stack spam)
  const commitSelectedStyleDebounced = debounce(commitSelectedStyle, 200);

  // --- MODE UI (Select vs Draw tools) ---
  const MODE_BUTTON_IDS = [
    "selectMode",
    "drawPoint",
    "drawLine",
    "drawPolygon",
    "drawCircle",
    "drawSquare",
    "drawRectangle",
    // Measure modes (only active if buttons exist in HTML)
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
    // Prevent clashes: measuring should disable draw + clear selection
    app.draw?.deactivate?.();
    app.edit?.clearSelection?.();

    app.measure?.setMode?.(mode);
    setModeActive(buttonId);
  }

  // --- DRAW / SELECT ---
  bindClick(
    "selectMode",
    () => {
      disableMeasure();
      app.draw.deactivate?.();
      app.edit?.clearSelection?.();
      setModeActive("selectMode");
    },
    { required: false }
  );

  bindClick(
    "drawPoint",
    () => {
      disableMeasure();
      app.draw.activate("Point", getStyleProps);
      setModeActive("drawPoint");
    },
    { required: false }
  );

  bindClick(
    "drawLine",
    () => {
      disableMeasure();
      app.draw.activate("LineString", getStyleProps);
      setModeActive("drawLine");
    },
    { required: false }
  );

  bindClick(
    "drawPolygon",
    () => {
      disableMeasure();
      app.draw.activate("Polygon", getStyleProps);
      setModeActive("drawPolygon");
    },
    { required: false }
  );

  bindClick(
    "drawCircle",
    () => {
      disableMeasure();
      app.draw.activate("Circle", getStyleProps);
      setModeActive("drawCircle");
    },
    { required: false }
  );

  bindClick(
    "drawSquare",
    () => {
      disableMeasure();
      app.draw.activate("Square", getStyleProps);
      setModeActive("drawSquare");
    },
    { required: false }
  );

  // Optional: only if the HTML has the button
  bindClick(
    "drawRectangle",
    () => {
      disableMeasure();
      app.draw.activate("Rectangle", getStyleProps);
      setModeActive("drawRectangle");
    },
    { required: false }
  );

  // --- MEASURE (optional buttons) ---
  // Add buttons with these IDs in HTML to enable:
  // - #measureLine  (distance)
  // - #measureArea  (area)
  // - #clearMeasure (clear measurements)
  bindClick(
    "measureLine",
    () => {
      enableMeasure("line", "measureLine");
    },
    { required: false }
  );

  bindClick(
    "measureArea",
    () => {
      enableMeasure("area", "measureArea");
    },
    { required: false }
  );

  bindClick(
    "clearMeasure",
    () => {
      app.measure?.clear?.();
    },
    { required: false }
  );

  bindClick(
    "clearDrawings",
    () => {
      if (!confirm("Clear all drawings?")) return;
      disableMeasure();
      app.edit?.clearSelection?.();
      app.draw.clear();
      app.draw.deactivate?.();
      setModeActive("selectMode");
      afterUserChange();
    },
    { required: false }
  );

  // --- DELETE SELECTED ---
  bindClick(
    "deleteSelectedBtn",
    () => {
      const n = app.edit?.deleteSelected?.() ?? 0;
      if (n) afterUserChange();
    },
    { required: false }
  );

  // Style controls apply to selected features.
  // Important: use a debounced commit on "input" (slider drag),
  // and a final immediate commit on "change" (release / final value).
  ["fillColor", "fillOpacity", "strokeColor", "strokeOpacity", "strokeWidth"].forEach((id) => {
    const el = $(id);
    if (!el) return;

    el.addEventListener("input", () => {
      // Live updates but don't spam history/autosave
      commitSelectedStyleDebounced();
    });

    el.addEventListener("change", () => {
      // Final commit as a real undo step
      commitSelectedStyle();
    });
  });

  // --- UNDO / REDO ---
  bindClick(
    "undoBtn",
    () => {
      if (app.history?.undo?.()) {
        disableMeasure();
        app.edit?.clearSelection?.();
        afterUserChange();
      }
    },
    { required: false }
  );

  bindClick(
    "redoBtn",
    () => {
      if (app.history?.redo?.()) {
        disableMeasure();
        app.edit?.clearSelection?.();
        afterUserChange();
      }
    },
    { required: false }
  );

  // --- PRINT PREVIEW CONTROLS ---
  $("#scale")?.addEventListener("change", () => {
    store.setState({ scale: $("#scale").value });
    afterUserChange();
  });

  $("#orientation")?.addEventListener("change", () => {
    store.setState({ orientation: $("#orientation").value });
    afterUserChange();
  });

  $("#showPreview")?.addEventListener("change", () => {
    store.setState({ showPreview: !!$("#showPreview").checked });
    afterUserChange();
  });

  // --- SEARCH + LOCATE ---
  bindClick("locateBtn", () => centerOnUserLocation({ view: app.view }), { required: false });

  bindClick(
    "searchBtn",
    async () => {
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
    },
    { required: false }
  );

  // --- QUICK PRINT ---
  bindClick(
    "quickPrint",
    () => {
      const isOSM = app.layers.osmLayer?.getVisible?.() ?? true;
      if (!isOSM) {
        alert("Quick Print only works with OSM due to browser security limits.");
        return;
      }

      const canvas = app.map.getViewport().querySelector("canvas");
      if (!canvas) return alert("Canvas not available.");

      const url = canvas.toDataURL("image/png");
      const win = window.open("", "_blank");
      win.document.write(`<img src="${url}" alt="Map Snapshot" style="max-width:100%;" />`);
    },
    { required: false }
  );

  // --- GEOJSON IMPORT/EXPORT ---
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

  bindClick(
    "exportGeoJSON",
    () => {
      const text = exportGeoJSON({ vectorSource: app.vectorSource });
      const blob = new Blob([text], { type: "application/geo+json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "truegis-drawings.geojson";
      a.click();
    },
    { required: false }
  );

  // --- SCALED PRINT ---
  bindClick(
    "print",
    async () => {
      const btn = $("#print");
      try {
        if (btn) btn.disabled = true;
        const spec = buildInkmapSpec({ app, store });
        await inkmapPrint(spec);
      } catch (e) {
        console.error("❌ Inkmap error:", e);
        alert("Print failed. See console.");
      } finally {
        if (btn) btn.disabled = false;
      }
    },
    { required: false }
  );

  // initial
  app.preview?.update?.();
  syncHistoryButtons();
  setModeActive("selectMode");
}
