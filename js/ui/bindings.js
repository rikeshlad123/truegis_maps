import { $ } from "../utils/dom.js";
import { nominatimSearch } from "../services/geocode.js";
import { centerOnUserLocation } from "../services/location.js";
import { inkmapPrint } from "../print/inkmapPrint.js";
import { buildInkmapSpec } from "../print/spec.js";
import { exportGeoJSON, importGeoJSONFile } from "../data/geojson.js";

function bindClick(id, handler, { required = false } = {}) {
  const el = $(id);
  if (!el) {
    // Only shout if the element is REQUIRED. Optional buttons should not spam console.
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

  // --- DRAW ---
  // "Select" mode = stop drawing and allow plain selection/editing
  bindClick("selectMode", () => app.draw.deactivate?.(), { required: false });

  bindClick("drawPoint", () => app.draw.activate("Point", getStyleProps), { required: false });
  bindClick("drawLine", () => app.draw.activate("LineString", getStyleProps), { required: false });
  bindClick("drawPolygon", () => app.draw.activate("Polygon", getStyleProps), { required: false });
  bindClick("drawCircle", () => app.draw.activate("Circle", getStyleProps), { required: false });
  bindClick("drawSquare", () => app.draw.activate("Square", getStyleProps), { required: false });

  // Optional: only works if you add a drawRectangle button in HTML
  bindClick("drawRectangle", () => app.draw.activate("Rectangle", getStyleProps), { required: false });

  bindClick(
    "clearDrawings",
    () => {
      if (!confirm("Clear all drawings?")) return;
      app.edit?.clearSelection?.();
      app.draw.clear();
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

  // Apply style to selected features when sliders change
  ["fillColor", "fillOpacity", "strokeColor", "strokeOpacity", "strokeWidth"].forEach((id) => {
    $(id)?.addEventListener("input", () => {
      const selected = app.edit?.getSelectedFeatures?.() ?? [];
      if (!selected.length) return;
      app.edit.applyStyleToSelected(getStyleProps(), app.draw.styleFeature);
      afterUserChange();
    });
  });

  // --- UNDO / REDO ---
  bindClick(
    "undoBtn",
    () => {
      if (app.history?.undo?.()) {
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
        app.edit?.clearSelection?.();
        afterUserChange();
      }
    },
    { required: false }
  );

  // Keyboard shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Y, Delete
  window.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const mod = isMac ? e.metaKey : e.ctrlKey;

    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      $("#undoBtn")?.click();
    } else if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
      e.preventDefault();
      $("#redoBtn")?.click();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      $("#deleteSelectedBtn")?.click();
    }
  });

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
    app.edit?.clearSelection?.();
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
}
