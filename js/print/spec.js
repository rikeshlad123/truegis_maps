import { CONFIG } from "../config.js";
import { rgba } from "../utils/colors.js";

/**
 * Builds the Inkmap spec.
 * - Uses RGBA everywhere so PDF honors transparency.
 * - Excludes preview rectangle feature by flag.
 */
export function buildInkmapSpec({ app, store }) {
  const { orientation, scale } = store.getState();

  const [widthMM, heightMM] =
    CONFIG.PAPER_SIZES[orientation] || CONFIG.PAPER_SIZES.landscape;

  const center = ol.proj.toLonLat(app.view.getCenter());

  const features = app.vectorSource
    .getFeatures()
    .filter((f) => !f.get("__truegis_preview"));

  const isOSM = app.layers.osmLayer.getVisible();

  const layers = [
    {
      type: "XYZ",
      url: isOSM
        ? "https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: isOSM ? "© OpenStreetMap contributors" : "© Esri & contributors",
    },
  ];

  for (const [i, feature] of features.entries()) {
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

    const json = JSON.parse(
      new ol.format.GeoJSON().writeFeature(feature, {
        dataProjection: "EPSG:3857",
        featureProjection: "EPSG:3857",
      })
    );

    const geomType = json.geometry?.type;
    const symbolizers = [];

    if (geomType === "Point") {
      symbolizers.push({
        kind: "Mark",
        wellKnownName: "circle",
        radius: 6,
        color: rgba(fillColor, fillOpacity),               // ✅ alpha
        strokeColor: rgba(strokeColor, strokeOpacity),     // ✅ alpha
        strokeWidth: 1,
      });
    } else if (geomType === "LineString" || geomType === "MultiLineString") {
      symbolizers.push({
        kind: "Line",
        color: rgba(strokeColor, strokeOpacity),
        width: strokeWidth,
      });
    } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
      symbolizers.push({
        kind: "Fill",
        color: rgba(fillColor, fillOpacity),
        outlineColor: rgba(strokeColor, strokeOpacity),
        outlineWidth: strokeWidth,
      });
      symbolizers.push({
        kind: "Line",
        color: rgba(strokeColor, strokeOpacity),
        width: strokeWidth,
      });
    } else {
      continue;
    }

    layers.push({
      type: "GeoJSON",
      geojson: {
        type: "FeatureCollection",
        features: [json],
      },
      style: {
        name: `Feature ${i + 1}`,
        rules: [{ symbolizers }],
      },
    });
  }

  return {
    layers,
    center,
    projection: "EPSG:3857",
    scale: Number(scale),
    dpi: CONFIG.DPI,
    size: [widthMM, heightMM, "mm"],
    scaleBar: { position: "bottom-left", units: "metric" },
    northArrow: "top-right",
    attributions: "bottom-right",
  };
}
