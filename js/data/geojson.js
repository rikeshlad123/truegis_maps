/**
 * GeoJSON helpers:
 * - Export excludes preview feature (__truegis_preview)
 * - Export is CANONICAL (stable) so history snapshots don't "randomly" differ
 * - Import restores per-feature style properties, then applies OpenLayers style
 *
 * Why canonical export matters:
 * Your undo/redo history stores snapshots as TEXT.
 * If JSON string output changes due to ordering/precision, history equality breaks
 * and redo gets wiped even when the map "looks the same".
 */

// Canonical numeric precision (degrees). ~1e-7 is sub-cm at equator; plenty stable.
const COORD_DECIMALS = 7;

// Stable ordering of style keys we care about
const STYLE_KEYS = ["fillColor", "fillOpacity", "strokeColor", "strokeOpacity", "strokeWidth"];

// Minimal stable rounding
function roundNum(n) {
  if (typeof n !== "number" || !isFinite(n)) return n;
  const p = Math.pow(10, COORD_DECIMALS);
  return Math.round(n * p) / p;
}

function roundCoordsDeep(coords) {
  if (!Array.isArray(coords)) return coords;
  // Coordinate pair: [x, y] (or [x, y, z])
  if (coords.length && typeof coords[0] === "number") {
    return coords.map((v) => (typeof v === "number" ? roundNum(v) : v));
  }
  return coords.map(roundCoordsDeep);
}

function stableSortKeys(obj) {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(stableSortKeys);
  if (typeof obj !== "object") return obj;

  const out = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) out[k] = stableSortKeys(obj[k]);
  return out;
}

function normalizeStylePropsFromFeature(f) {
  const p = f.getProperties?.() || {};

  const fillOpacity =
    typeof p.fillOpacity === "number"
      ? p.fillOpacity
      : parseFloat(p.fillOpacity ?? "0.4");

  const strokeOpacity =
    typeof p.strokeOpacity === "number"
      ? p.strokeOpacity
      : parseFloat(p.strokeOpacity ?? "1");

  const strokeWidth =
    typeof p.strokeWidth === "number"
      ? p.strokeWidth
      : parseInt(p.strokeWidth ?? "2", 10);

  return {
    fillColor: p.fillColor || "#ff0000",
    fillOpacity: Math.max(0, Math.min(1, isFinite(fillOpacity) ? fillOpacity : 0.4)),
    strokeColor: p.strokeColor || "#000000",
    strokeOpacity: Math.max(0, Math.min(1, isFinite(strokeOpacity) ? strokeOpacity : 1)),
    strokeWidth: Math.max(1, isFinite(strokeWidth) ? strokeWidth : 2),
  };
}

function getStableFeatureId(f, idx) {
  // Use an explicit id if present, else fall back to stable geometry+props hash surrogate.
  // (We don't persist this id, it is only for stable export ordering.)
  const id = f.getId?.();
  if (id != null) return String(id);

  const g = f.getGeometry?.();
  const t = g?.getType?.() || "Unknown";
  const e = g?.getExtent?.();
  const extentKey = Array.isArray(e) ? e.map((n) => Math.round(n)).join(",") : "";

  const style = normalizeStylePropsFromFeature(f);
  const styleKey = STYLE_KEYS.map((k) => `${k}:${style[k]}`).join("|");

  // idx included as last resort to avoid collisions when everything matches
  return `${t}|${extentKey}|${styleKey}|${idx}`;
}

/**
 * Export GeoJSON text.
 * - Filters out preview features
 * - Normalizes style props
 * - Uses stable feature ordering
 * - Rounds coordinates
 * - Stable key ordering (for deterministic JSON string)
 */
export function exportGeoJSON({ vectorSource }) {
  const fmt = new ol.format.GeoJSON();

  const raw = vectorSource
    .getFeatures()
    .filter((f) => !f.get("__truegis_preview"));

  // Normalize style props on export so future imports / print always match
  raw.forEach((f) => {
    const styleProps = normalizeStylePropsFromFeature(f);
    f.setProperties(styleProps);
  });

  // Stable order so JSON text remains identical across runs
  const features = raw
    .map((f, idx) => ({ f, key: getStableFeatureId(f, idx) }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((x) => x.f);

  const geojsonObj = fmt.writeFeaturesObject(features, {
    featureProjection: "EPSG:3857",
    dataProjection: "EPSG:4326",
  });

  // Round coordinates deterministically
  if (geojsonObj?.features?.length) {
    for (const feat of geojsonObj.features) {
      if (feat?.geometry?.coordinates) {
        feat.geometry.coordinates = roundCoordsDeep(feat.geometry.coordinates);
      }
      // Ensure only stable properties are present (exclude OL internals)
      const props = feat.properties || {};
      const cleanProps = {};
      // Keep style props first (stable), then any other user props sorted
      for (const k of STYLE_KEYS) {
        if (props[k] !== undefined) cleanProps[k] = props[k];
      }
      const extraKeys = Object.keys(props)
        .filter((k) => !STYLE_KEYS.includes(k) && k !== "__truegis_preview")
        .sort();
      for (const k of extraKeys) cleanProps[k] = props[k];
      feat.properties = cleanProps;
    }
  }

  // Stable key ordering for entire object tree
  const canonical = stableSortKeys(geojsonObj);

  // No pretty-printing: whitespace differences would break snapshot equality
  return JSON.stringify(canonical);
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

  let features = [];
  try {
    features = fmt.readFeatures(text, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });
  } catch (e) {
    console.error("[geojson] Failed to parse GeoJSON:", e);
    return [];
  }

  const clean = features.filter((f) => !f.get("__truegis_preview"));

  for (const f of clean) {
    const styleProps = normalizeStylePropsFromFeature(f);
    f.setProperties(styleProps);
    applyStyle?.(f, styleProps);
  }

  vectorSource.addFeatures(clean);
  return clean;
}
