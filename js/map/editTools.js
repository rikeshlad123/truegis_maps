import { rgba } from "../utils/colors.js";

/**
 * Selection + vertex editing (Modify) for drawn features.
 * - Ignores preview feature (__truegis_preview)
 * - Helpers for delete + style updates on selected features
 */
export function initEditTools({ map, vectorSource, onChange }) {
  const select = new ol.interaction.Select({
    filter: (feature) => !feature.get("__truegis_preview"),
    hitTolerance: 6,
    style: (feature) => {
      const fillColor = feature.get("fillColor") || "#ff0000";
      const fillOpacity =
        typeof feature.get("fillOpacity") === "number"
          ? feature.get("fillOpacity")
          : parseFloat(feature.get("fillOpacity") ?? "0.4");

      const strokeColor = feature.get("strokeColor") || "#000000";
      const strokeOpacity =
        typeof feature.get("strokeOpacity") === "number"
          ? feature.get("strokeOpacity")
          : parseFloat(feature.get("strokeOpacity") ?? "1");

      const strokeWidth =
        typeof feature.get("strokeWidth") === "number"
          ? feature.get("strokeWidth")
          : parseInt(feature.get("strokeWidth") ?? "2", 10);

      const geomType = feature.getGeometry()?.getType?.();

      const commonStroke = new ol.style.Stroke({
        color: rgba(strokeColor, Math.min(1, strokeOpacity)),
        width: Math.max(2, strokeWidth + 2),
        lineDash: [6, 4],
      });

      if (geomType === "Point") {
        return new ol.style.Style({
          image: new ol.style.Circle({
            radius: 7,
            fill: new ol.style.Fill({ color: rgba(fillColor, fillOpacity) }),
            stroke: commonStroke,
          }),
        });
      }

      return new ol.style.Style({
        stroke: commonStroke,
        fill: new ol.style.Fill({
          color: rgba(fillColor, Math.max(0.05, fillOpacity)),
        }),
      });
    },
  });

  const modify = new ol.interaction.Modify({
    features: select.getFeatures(),
    pixelTolerance: 10,
  });

  // Geometry edits should snapshot/autosave
  modify.on("modifyend", () => onChange?.());

  map.addInteraction(select);
  map.addInteraction(modify);

  function getSelectedFeatures() {
    return select.getFeatures().getArray();
  }

  function clearSelection() {
    select.getFeatures().clear();
  }

  function deleteSelected() {
    const feats = getSelectedFeatures();
    if (!feats.length) return 0;
    feats.forEach((f) => vectorSource.removeFeature(f));
    clearSelection();
    onChange?.();
    return feats.length;
  }

  function normalizeStyleProps(next, feature) {
    const merged = {
      fillColor: feature.get("fillColor") ?? "#ff0000",
      fillOpacity: feature.get("fillOpacity") ?? 0.4,
      strokeColor: feature.get("strokeColor") ?? "#000000",
      strokeOpacity: feature.get("strokeOpacity") ?? 1,
      strokeWidth: feature.get("strokeWidth") ?? 2,
      ...next,
    };

    merged.fillOpacity =
      typeof merged.fillOpacity === "number"
        ? merged.fillOpacity
        : parseFloat(merged.fillOpacity);

    merged.strokeOpacity =
      typeof merged.strokeOpacity === "number"
        ? merged.strokeOpacity
        : parseFloat(merged.strokeOpacity);

    merged.strokeWidth =
      typeof merged.strokeWidth === "number"
        ? merged.strokeWidth
        : parseInt(merged.strokeWidth, 10);

    // clamp/sanity
    merged.fillOpacity = Math.max(0, Math.min(1, merged.fillOpacity));
    merged.strokeOpacity = Math.max(0, Math.min(1, merged.strokeOpacity));
    merged.strokeWidth = Math.max(1, merged.strokeWidth);

    return merged;
  }

  function applyStyleToSelected(styleProps, applyStyle) {
    const feats = getSelectedFeatures();
    feats.forEach((f) => {
      const merged = normalizeStyleProps(styleProps, f);

      // persist for export/print
      f.setProperties(merged);

      // re-style in OL (this is what makes it stick after deselect)
      applyStyle?.(f, merged);
    });

    onChange?.();
    return feats.length;
  }

  return {
    select,
    modify,
    getSelectedFeatures,
    clearSelection,
    deleteSelected,
    applyStyleToSelected,
  };
}
