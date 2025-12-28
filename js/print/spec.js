import { CONFIG } from "../config.js";
import { rgba } from "../utils/colors.js";

export function buildInkmapSpec({ app, store }) {
  const { orientation, scale } = store.getState();
  const [widthMM, heightMM] =
    CONFIG.PAPER_SIZES[orientation] || CONFIG.PAPER_SIZES.landscape;

  const center = ol.proj.toLonLat(app.view.getCenter());

  const features = app.vectorSource
    .getFeatures()
    .filter((f) => !f.get("__truegis_preview"));

  const isOSM = app.layers.osmLayer?.getVisible?.() ?? true;

  const layers = [
    {
      type: "XYZ",
      url: isOSM
        ? "https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: isOSM
        ? "© OpenStreetMap contributors"
        : "© Esri & contributors",
    },
  ];

  for (const [i, feature] of features.entries()) {
    const fillColor = feature.get("fillColor") || "#ff0000";
    const fillOpacity = Number(feature.get("fillOpacity") ?? 0.4);
    const strokeColor = feature.get("strokeColor") || "#000000";
    const strokeOpacity = Number(feature.get("strokeOpacity") ?? 1);
    const strokeWidth = Number(feature.get("strokeWidth") ?? 2);

    // Inkmap/GeoJSON does not support OpenLayers Circle geometry.
    // Convert circles to polygons so they render in the scaled print.
    let geom = feature.getGeometry();
    if (geom?.getType?.() === "Circle") {
      geom = ol.geom.Polygon.fromCircle(geom, 96); // smoother circle
    }

    const tmpFeature = new ol.Feature(geom);

    const json = JSON.parse(
      new ol.format.GeoJSON().writeFeature(tmpFeature, {
        dataProjection: "EPSG:3857",
        featureProjection: "EPSG:3857",
      })
    );

    const geomType = json.geometry?.type;
    let symbolizers = [];

    if (geomType === "Point") {
      symbolizers.push({
        kind: "Mark",
        wellKnownName: "circle",
        radius: 6,
        color: rgba(fillColor, fillOpacity),
        strokeColor: rgba(strokeColor, strokeOpacity),
        strokeWidth: Math.max(1, strokeWidth),
      });
    } else if (geomType === "LineString" || geomType === "MultiLineString") {
      symbolizers.push({
        kind: "Line",
        color: rgba(strokeColor, strokeOpacity),
        width: Math.max(1, strokeWidth),
      });
    } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
      symbolizers.push({
        kind: "Fill",
        color: rgba(fillColor, fillOpacity),
        outlineColor: rgba(strokeColor, strokeOpacity),
        outlineWidth: Math.max(1, strokeWidth),
      });
    } else {
      continue;
    }

    layers.push({
      type: "GeoJSON",
      geojson: { type: "FeatureCollection", features: [json] },
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
