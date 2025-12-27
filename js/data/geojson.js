export function exportGeoJSON({ vectorSource }) {
  const fmt = new ol.format.GeoJSON();

  // ✅ don't export preview rectangle
  const features = vectorSource
    .getFeatures()
    .filter((f) => !f.get("__truegis_preview"));

  const geojsonObj = fmt.writeFeaturesObject(features, {
    featureProjection: "EPSG:3857",
    dataProjection: "EPSG:4326",
  });

  return JSON.stringify(geojsonObj, null, 2);
}

export async function importGeoJSONFile({ file, vectorSource, applyStyle }) {
  const text = await file.text();
  const fmt = new ol.format.GeoJSON();

  const features = fmt.readFeatures(text, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });

  // ✅ ignore preview feature if it exists in file (safety)
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

    // ensure properties exist (for later export/print)
    f.setProperties(styleProps);

    // restore OL style
    applyStyle?.(f, styleProps);
  }

  vectorSource.addFeatures(clean);
  return clean;
}
