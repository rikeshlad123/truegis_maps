/**
 * GeoJSON helpers:
 * - Export excludes preview feature (__truegis_preview)
 * - Import restores per-feature style properties, then applies OpenLayers style
 */

export function exportGeoJSON({ vectorSource }) {
  const fmt = new ol.format.GeoJSON();

  const features = vectorSource
    .getFeatures()
    .filter((f) => !f.get("__truegis_preview"));

  const geojsonObj = fmt.writeFeaturesObject(features, {
    featureProjection: "EPSG:3857",
    dataProjection: "EPSG:4326",
  });

  return JSON.stringify(geojsonObj, null, 2);
}

/**
 * Import from a File object (from <input type="file">).
 * Returns imported features (excluding preview).
 */
export async function importGeoJSONFile({ file, vectorSource, applyStyle }) {
  const text = await file.text();
  return importGeoJSONText({ text, vectorSource, applyStyle });
}

/**
 * Import from raw GeoJSON text.
 * Adds features to the vectorSource and returns them.
 */
export function importGeoJSONText({ text, vectorSource, applyStyle }) {
  const fmt = new ol.format.GeoJSON();

  const features = fmt.readFeatures(text, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });

  const clean = features.filter((f) => !f.get("__truegis_preview"));

  for (const f of clean) {
    const p = f.getProperties?.() || {};

    const styleProps = {
      fillColor: p.fillColor || "#ff0000",
      fillOpacity:
        typeof p.fillOpacity === "number"
          ? p.fillOpacity
          : parseFloat(p.fillOpacity ?? "0.4"),
      strokeColor: p.strokeColor || "#000000",
      strokeOpacity:
        typeof p.strokeOpacity === "number"
          ? p.strokeOpacity
          : parseFloat(p.strokeOpacity ?? "1"),
      strokeWidth:
        typeof p.strokeWidth === "number"
          ? p.strokeWidth
          : parseInt(p.strokeWidth ?? "2", 10),
    };

    f.setProperties(styleProps);
    applyStyle?.(f, styleProps);
  }

  vectorSource.addFeatures(clean);
  return clean;
}
