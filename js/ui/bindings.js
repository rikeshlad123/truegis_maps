import { $ } from "../utils/dom.js";
import { nominatimSearch } from "../services/geocode.js";
import { centerOnUserLocation } from "../services/location.js";
import { inkmapPrint } from "../print/inkmapPrint.js";
import { buildInkmapSpec } from "../print/spec.js";
import { exportGeoJSON, importGeoJSONFile } from "../data/geojson.js";

function bindClick(id, handler, { required = false } = {}) {
  const el = $(id);
  if (!el) {
    const msg = `[ui] Missing element #${id}. ${
      required ? "This is required for the current UI." : "Skipping."
    }`;
    (required ? console.error : console.warn)(msg);
    return null;
  }
  el.onclick = handler;
  return el;
}

export function bindUI({ app, store }) {
  const onFeatureAdded = () => app.preview?.update?.();

  const getStyleProps = () => ({
    fillColor: $("#fillColor")?.value || "#ff0000",
    fillOpacity: parseFloat($("#fillOpacity")?.value ?? "0.4"),
    strokeColor: $("#strokeColor")?.value || "#000000",
    strokeOpacity: parseFloat($("#strokeOpacity")?.value ?? "1"),
    strokeWidth: parseInt($("#strokeWidth")?.value ?? "2", 10),
  });

  // Draw
  bindClick("drawPoint", () => app.draw.activate("Point", getStyleProps), { required: false });
  bindClick("drawLine", () => app.draw.activate("LineString", getStyleProps), { required: false });
  bindClick("drawPolygon", () => app.draw.activate("Polygon", getStyleProps), { required: false });
  bindClick("drawCircle", () => app.draw.activate("Circle", getStyleProps), { required: false });

  // Rectangle + Square (only if buttons exist in HTML)
  $("#drawRectangle")?.addEventListener("click", () => app.draw.activate("Rectangle", getStyleProps));
  $("#drawSquare")?.addEventListener("click", () => app.draw.activate("Square", getStyleProps));

  bindClick(
    "clearDrawings",
    () => {
      app.draw.clear();
      onFeatureAdded();
    },
    { required: false }
  );

  // Basemap toggle (optional)
  const basemapSelect = $("#basemap");
  if (basemapSelect) {
    basemapSelect.onchange = () => {
      const val = basemapSelect.value;
      app.layers.osmLayer?.setVisible?.(val === "osm");
      app.layers.esriLayer?.setVisible?.(val === "esri");
    };
  }

  // Preview controls
  const scaleEl = $("#scale");
  if (scaleEl) scaleEl.onchange = () => store.setState({ scale: scaleEl.value });

  const orientEl = $("#orientation");
  if (orientEl) orientEl.onchange = () => store.setState({ orientation: orientEl.value });

  const showPrevEl = $("#showPreview");
  if (showPrevEl) showPrevEl.onchange = () => store.setState({ showPreview: !!showPrevEl.checked });

  // Search + locate
  bindClick("locateBtn", () => centerOnUserLocation({ view: app.view }), { required: false });

  const searchBtn = $("#searchBtn");
  if (searchBtn) {
    searchBtn.onclick = async () => {
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
    };
  }

  // Quick Print (optional)
  const quickBtn = $("#quickPrint");
  if (quickBtn) {
    quickBtn.onclick = () => {
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
    };
  }

  // GeoJSON import/export UI
  $("#importGeoJSON")?.addEventListener("click", () => $("#geojsonFile")?.click());

  $("#geojsonFile")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await importGeoJSONFile({
      file,
      vectorSource: app.vectorSource,
      applyStyle: app.draw.styleFeature, // ✅ restores styles
    });

    e.target.value = "";
    onFeatureAdded();
  });

  $("#exportGeoJSON")?.addEventListener("click", () => {
    const text = exportGeoJSON({ vectorSource: app.vectorSource });
    const blob = new Blob([text], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "truegis-drawings.geojson";
    a.click();
  });

  // Inkmap Print (no gating)
  const printBtn = $("#print");
  if (printBtn) {
    printBtn.onclick = async () => {
      try {
        printBtn.disabled = true;
        const spec = buildInkmapSpec({ app, store });
        await inkmapPrint(spec);
      } catch (e) {
        console.error("❌ Inkmap error:", e);
        alert("Print failed. See console.");
      } finally {
        printBtn.disabled = false;
      }
    };
  }
}
