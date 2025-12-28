import { $ } from "../utils/dom.js";
import { nominatimSearch } from "../services/geocode.js";
import { centerOnUserLocation } from "../services/location.js";
import { inkmapPrint } from "../print/inkmapPrint.js";
import { buildInkmapSpec } from "../print/spec.js";
import { exportGeoJSON, importGeoJSONFile } from "../data/geojson.js";

function bindClick(id, handler, { required = false } = {}) {
  const el = $(id);
  if (!el) {
    if (required) console.error(`[ui] Missing element #${id}. This is required for the current UI.`);
    return null;
  }
  el.onclick = handler;
  return el;
}

export function bindUI({ app, store }) {
  const onUserChange = () => app.preview?.update?.();

  const getStyleProps = () => ({
    fillColor: $("#fillColor")?.value || "#ff0000",
    fillOpacity: parseFloat($("#fillOpacity")?.value ?? "0.4"),
    strokeColor: $("#strokeColor")?.value || "#000000",
    strokeOpacity: parseFloat($("#strokeOpacity")?.value ?? "1"),
    strokeWidth: parseInt($("#strokeWidth")?.value ?? "2", 10),
  });

  // --- DRAW MODES ---
  bindClick("selectMode", () => {
    app.draw?.deactivate?.();
    onUserChange();
  });

  bindClick("drawPoint", () => app.draw.activate("Point", getStyleProps));
  bindClick("drawLine", () => app.draw.activate("LineString", getStyleProps));
  bindClick("drawPolygon", () => app.draw.activate("Polygon", getStyleProps));
  bindClick("drawCircle", () => app.draw.activate("Circle", getStyleProps));
  bindClick("drawSquare", () => app.draw.activate("Square", getStyleProps));

  // Optional: only if you add it in HTML + draw tools support it
  bindClick("drawRectangle", () => app.draw.activate("Rectangle", getStyleProps), { required: false });

  bindClick("clearDrawings", () => {
    if (!confirm("Clear all drawings?")) return;
    app.draw.clear();
    onUserChange();
  });

  // --- PRINT PREVIEW CONTROLS ---
  $("#scale")?.addEventListener("change", () => {
    store.setState({ scale: $("#scale").value });
    onUserChange();
  });

  $("#orientation")?.addEventListener("change", () => {
    store.setState({ orientation: $("#orientation").value });
    onUserChange();
  });

  $("#showPreview")?.addEventListener("change", () => {
    store.setState({ showPreview: !!$("#showPreview").checked });
    onUserChange();
  });

  // --- SEARCH + LOCATE ---
  bindClick("locateBtn", () => centerOnUserLocation({ view: app.view }));

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
  });

  // --- QUICK PRINT ---
  bindClick("quickPrint", () => {
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
  });

  // --- GEOJSON IMPORT/EXPORT ---
  bindClick("importGeoJSON", () => $("#geojsonFile")?.click());

  $("#geojsonFile")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await importGeoJSONFile({
      file,
      vectorSource: app.vectorSource,
      applyStyle: app.draw.styleFeature, // reapply saved props -> style
      excludePreview: true,              // optional param (see note below)
    });

    e.target.value = "";
    onUserChange();
  });

  bindClick("exportGeoJSON", () => {
    const text = exportGeoJSON({ vectorSource: app.vectorSource, excludePreview: true });
    const blob = new Blob([text], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "truegis-drawings.geojson";
    a.click();
  });

  // --- SCALED PRINT ---
  bindClick("print", async () => {
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
  });

  // initial
  app.preview?.update?.();
}
