import { CONFIG, getPaperSizeMM } from "../config.js";
import { rgba } from "../utils/colors.js";

function featureToInkmapGeoJSON(feature) {
  // Inkmap/GeoJSON does not support OpenLayers Circle geometry.
  // Convert circles to polygons so they render in the scaled print.
  let geom = feature.getGeometry();
  if (geom?.getType?.() === "Circle") {
    geom = ol.geom.Polygon.fromCircle(geom, 96);
  }

  const tmpFeature = new ol.Feature(geom);
  return JSON.parse(
    new ol.format.GeoJSON().writeFeature(tmpFeature, {
      dataProjection: "EPSG:3857",
      featureProjection: "EPSG:3857",
    })
  );
}

function featureLayerForInkmap(feature, index) {
  const fillColor = feature.get("fillColor") || "#ff0000";
  const fillOpacity = Number(feature.get("fillOpacity") ?? 0.4);
  const strokeColor = feature.get("strokeColor") || "#000000";
  const strokeOpacity = Number(feature.get("strokeOpacity") ?? 1);
  const strokeWidth = Number(feature.get("strokeWidth") ?? 2);

  const json = featureToInkmapGeoJSON(feature);
  const geomType = json.geometry?.type;
  const symbolizers = [];

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
    return null;
  }

  return {
    type: "GeoJSON",
    geojson: { type: "FeatureCollection", features: [json] },
    style: {
      name: `Feature ${index + 1}`,
      rules: [{ symbolizers }],
    },
  };
}

function ddpBoundaryLayer(ddpFeature) {
  if (!ddpFeature) return null;

  const json = featureToInkmapGeoJSON(ddpFeature);
  return {
    type: "GeoJSON",
    geojson: { type: "FeatureCollection", features: [json] },
    style: {
      name: `DDP Page ${ddpFeature.get("page_no") || ""}`,
      rules: [
        {
          symbolizers: [
            {
              kind: "Fill",
              color: rgba("#2f80ff", 0.05),
              outlineColor: rgba("#2f80ff", 0.95),
              outlineWidth: 2,
            },
          ],
        },
      ],
    },
  };
}

export function buildInkmapSpec({ app, store, center3857 = null, scaleOverride = null, paperSizeOverride = null, ddpFeature = null }) {
  const { orientation, scale, paperSize } = store.getState();
  const finalPaperSize = paperSizeOverride || paperSize || "A4";
  const [widthMM, heightMM] = getPaperSizeMM(finalPaperSize, orientation);

  const center = ol.proj.toLonLat(center3857 || app.view.getCenter());

  const features = app.vectorSource
    .getFeatures()
    .filter((f) => !f.get("__truegis_preview") && !f.get("__truegis_ddp"));

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
    const layer = featureLayerForInkmap(feature, i);
    if (layer) layers.push(layer);
  }

  const boundaryLayer = ddpBoundaryLayer(ddpFeature);
  if (boundaryLayer) layers.push(boundaryLayer);

  return {
    layers,
    center,
    projection: "EPSG:3857",
    scale: Number(scaleOverride || scale),
    dpi: CONFIG.DPI,
    size: [widthMM, heightMM, "mm"],
    scaleBar: { position: "bottom-left", units: "metric" },
    northArrow: "top-right",
    attributions: "bottom-right",
  };
}
