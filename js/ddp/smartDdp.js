import { CONFIG, getPaperSizeMM } from "../config.js";

const MAX_POINTS = 240;
const MAX_CANDIDATES = 360;
const EXACT_MS = 900;
const EPS = 0.01;

const clamp = (v, fallback, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

const rectKey = (r) => `${Math.round(r.minX)}:${Math.round(r.minY)}`;
const pointKey = (p) => `${Math.round(p[0] * 10) / 10}:${Math.round(p[1] * 10) / 10}`;
const contains = (r, p) => p[0] >= r.minX - EPS && p[0] <= r.maxX + EPS && p[1] >= r.minY - EPS && p[1] <= r.maxY + EPS;
const rect = (minX, minY, width, height) => ({ minX, minY, maxX: minX + width, maxY: minY + height, width, height });
const expand = (e, b) => [e[0] - b, e[1] - b, e[2] + b, e[3] + b];

function rectToPolygon(r) {
  return new ol.geom.Polygon([[[r.minX, r.minY], [r.maxX, r.minY], [r.maxX, r.maxY], [r.minX, r.maxY], [r.minX, r.minY]]]);
}

function densify(a, b, spacing, out) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(d / Math.max(1, spacing)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
}

function sampleLine(coords, spacing, out) {
  for (let i = 0; i < coords.length - 1; i += 1) densify(coords[i], coords[i + 1], spacing, out);
}

function addExtentPoints(extent, out) {
  const [minX, minY, maxX, maxY] = extent;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  out.push([minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [midX, minY], [maxX, midY], [midX, maxY], [minX, midY], [midX, midY]);
}

function ringContains(ring, p) {
  const x = p[0];
  const y = p[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function polygonContains(rings, p) {
  if (!rings?.length || !ringContains(rings[0], p)) return false;
  for (let i = 1; i < rings.length; i += 1) if (ringContains(rings[i], p)) return false;
  return true;
}

function geomContains(geom, p) {
  const type = geom?.getType?.();
  if (type === "Polygon") return polygonContains(geom.getCoordinates(), p);
  if (type === "MultiPolygon") return geom.getCoordinates().some((poly) => polygonContains(poly, p));
  if (type === "Circle") {
    const c = geom.getCenter();
    return Math.hypot(p[0] - c[0], p[1] - c[1]) <= geom.getRadius();
  }
  return false;
}

function addInteriorSamples(geom, spacing, out) {
  const e = geom.getExtent();
  const w = e[2] - e[0];
  const h = e[3] - e[1];
  if (!(w > 0) || !(h > 0)) return;
  const nx = Math.max(2, Math.min(8, Math.ceil(w / Math.max(spacing * 1.5, 1))));
  const ny = Math.max(2, Math.min(8, Math.ceil(h / Math.max(spacing * 1.5, 1))));
  for (let ix = 1; ix < nx; ix += 1) {
    for (let iy = 1; iy < ny; iy += 1) {
      const p = [e[0] + (w * ix) / nx, e[1] + (h * iy) / ny];
      if (geomContains(geom, p)) out.push(p);
    }
  }
}

function sampleGeometry(geom, spacing, out) {
  if (!geom) return;
  const type = geom.getType?.();
  if (type === "Point") out.push(geom.getCoordinates());
  else if (type === "MultiPoint") out.push(...geom.getCoordinates());
  else if (type === "LineString") sampleLine(geom.getCoordinates(), spacing, out);
  else if (type === "MultiLineString") geom.getCoordinates().forEach((line) => sampleLine(line, spacing, out));
  else if (type === "Polygon") {
    geom.getCoordinates().forEach((ring) => sampleLine(ring, spacing, out));
    addInteriorSamples(geom, spacing, out);
  } else if (type === "MultiPolygon") {
    geom.getCoordinates().forEach((poly) => poly.forEach((ring) => sampleLine(ring, spacing, out)));
    addInteriorSamples(geom, spacing, out);
  } else if (type === "Circle") sampleGeometry(ol.geom.Polygon.fromCircle(geom, 96), spacing, out);
  else if (type === "GeometryCollection") geom.getGeometries().forEach((g) => sampleGeometry(g, spacing, out));
}

function uniquePoints(points) {
  const seen = new Set();
  const out = [];
  for (const p of points) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const key = pointKey(p);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function thin(points, maxCount) {
  if (points.length <= maxCount) return points;
  const e = ol.extent.boundingExtent(points);
  const w = Math.max(1, e[2] - e[0]);
  const h = Math.max(1, e[3] - e[1]);
  const grid = Math.ceil(Math.sqrt(maxCount));
  const buckets = new Map();
  for (const p of points) {
    const gx = Math.min(grid - 1, Math.max(0, Math.floor(((p[0] - e[0]) / w) * grid)));
    const gy = Math.min(grid - 1, Math.max(0, Math.floor(((p[1] - e[1]) / h) * grid)));
    const key = `${gx}:${gy}`;
    if (!buckets.has(key)) buckets.set(key, p);
  }
  return Array.from(buckets.values()).slice(0, maxCount);
}

function addBufferOffsets(points, buffer) {
  if (!(buffer > 0)) return points;
  const d = buffer / Math.SQRT2;
  const offsets = [[0, 0], [buffer, 0], [-buffer, 0], [0, buffer], [0, -buffer], [d, d], [d, -d], [-d, d], [-d, -d]];
  const out = [];
  for (const p of points) for (const o of offsets) out.push([p[0] + o[0], p[1] + o[1]]);
  return out;
}

function inputFeatures(vectorSource) {
  return vectorSource.getFeatures().filter((f) => !f.get("__truegis_preview") && !f.get("__truegis_ddp"));
}

function analysisPoints(features, pageW, pageH, buffer) {
  const spacing = Math.max(8, Math.min(pageW, pageH) / 5);
  const points = [];
  let all = null;
  for (const f of features) {
    const g = f.getGeometry?.();
    if (!g) continue;
    const e = g.getExtent();
    all = all ? ol.extent.extend(all, e.slice()) : e.slice();
    sampleGeometry(g, spacing, points);
    addExtentPoints(expand(e, buffer), points);
  }
  if (all) addExtentPoints(expand(all, buffer), points);
  return thin(uniquePoints(addBufferOffsets(points, buffer)), MAX_POINTS);
}

function fractions(overlapPct) {
  const f = Math.max(0.05, Math.min(0.45, overlapPct / 100 || 0.2));
  return [...new Set([0.02, f, 0.25, 0.5, 0.75, 1 - f, 0.98].map((x) => Math.round(Math.max(0.01, Math.min(0.99, x)) * 1000) / 1000))];
}

function addCandidate(cands, seen, r, points) {
  const key = rectKey(r);
  if (seen.has(key)) return;
  let count = 0;
  for (const p of points) if (contains(r, p)) count += 1;
  if (!count) return;
  seen.add(key);
  cands.push({ ...r, rawCount: count });
}

function extremePoints(points) {
  const byX = [...points].sort((a, b) => a[0] - b[0]);
  const byY = [...points].sort((a, b) => a[1] - b[1]);
  const out = [...byX.slice(0, 8), ...byX.slice(-8), ...byY.slice(0, 8), ...byY.slice(-8)];
  const stride = Math.max(1, Math.floor(points.length / 32));
  for (let i = 0; i < points.length; i += stride) out.push(points[i]);
  return uniquePoints(out);
}

function candidates(points, pageW, pageH, overlapPct) {
  const cands = [];
  const seen = new Set();
  const e = ol.extent.boundingExtent(points);
  const overlap = clamp(overlapPct, 20, 0, 80) / 100;
  const stepX = pageW * Math.max(0.1, 1 - overlap);
  const stepY = pageH * Math.max(0.1, 1 - overlap);
  const fs = fractions(overlapPct);

  for (const p of points) for (const fx of fs) for (const fy of fs) addCandidate(cands, seen, rect(p[0] - pageW * fx, p[1] - pageH * fy, pageW, pageH), points);

  // Global X/Y phase sweep: catches cases where a slight overall reposition turns 6 pages into 4.
  const phases = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
  for (const px of phases) for (const py of phases) {
    for (let x = e[0] - pageW + px * stepX; x <= e[2] + EPS; x += stepX) {
      for (let y = e[1] - pageH + py * stepY; y <= e[3] + EPS; y += stepY) addCandidate(cands, seen, rect(x, y, pageW, pageH), points);
    }
  }

  // Pair-fitted pages: cover two far points in one north-up page where possible.
  const keys = extremePoints(points);
  const freedom = Math.max(0.05, Math.min(0.45, overlap || 0.2));
  for (let i = 0; i < keys.length; i += 1) for (let j = i + 1; j < keys.length; j += 1) {
    const a = keys[i], b = keys[j];
    const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
    const minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
    if (maxX - minX > pageW + EPS || maxY - minY > pageH + EPS) continue;
    const spareX = pageW - (maxX - minX), spareY = pageH - (maxY - minY);
    [0.5, freedom, 1 - freedom].forEach((fx) => [0.5, freedom, 1 - freedom].forEach((fy) => addCandidate(cands, seen, rect(minX - spareX * fx, minY - spareY * fy, pageW, pageH), points)));
  }

  return cands.sort((a, b) => b.rawCount - a.rawCount).slice(0, MAX_CANDIDATES);
}

function popcount(mask) {
  let n = 0, x = mask;
  while (x) { x &= x - 1n; n += 1; }
  return n;
}

function firstUncovered(mask, total) {
  for (let i = 0; i < total; i += 1) if ((mask & (1n << BigInt(i))) === 0n) return i;
  return -1;
}

function buildMasks(cands, points) {
  return cands.map((c, idx) => {
    let mask = 0n;
    points.forEach((p, i) => { if (contains(c, p)) mask |= 1n << BigInt(i); });
    return { ...c, idx, mask, count: popcount(mask) };
  }).filter((c) => c.count > 0);
}

function greedy(cands, full) {
  let covered = 0n;
  const chosen = [];
  const left = new Set(cands.map((_, i) => i));
  while (covered !== full && left.size) {
    let best = -1, bestGain = -1;
    for (const i of left) {
      const gain = popcount(cands[i].mask & ~covered);
      if (gain > bestGain) { best = i; bestGain = gain; }
    }
    if (best < 0 || bestGain <= 0) break;
    chosen.push(best);
    covered |= cands[best].mask;
    left.delete(best);
  }
  return { chosen, covered };
}

function exactImprove(cands, full, chosen, pointCount) {
  if (chosen.length <= 1) return chosen;
  const start = performance.now();
  const byPoint = Array.from({ length: pointCount }, () => []);
  cands.forEach((c, idx) => {
    for (let p = 0; p < pointCount; p += 1) if ((c.mask & (1n << BigInt(p))) !== 0n) byPoint[p].push(idx);
  });
  byPoint.forEach((arr) => arr.sort((a, b) => cands[b].count - cands[a].count));

  for (let target = 1; target < chosen.length; target += 1) {
    const found = dfs(0n, [], target, new Set());
    if (found) return found;
  }
  return chosen;

  function dfs(mask, stack, target, used) {
    if (performance.now() - start > EXACT_MS) return null;
    if (mask === full) return stack.slice();
    if (stack.length >= target) return null;
    const p = firstUncovered(mask, pointCount);
    const opts = byPoint[p].filter((idx) => !used.has(idx)).map((idx) => ({ idx, gain: popcount(cands[idx].mask & ~mask) })).filter((x) => x.gain > 0).sort((a, b) => b.gain - a.gain).slice(0, 36);
    for (const opt of opts) {
      used.add(opt.idx); stack.push(opt.idx);
      const result = dfs(mask | cands[opt.idx].mask, stack, target, used);
      if (result) return result;
      stack.pop(); used.delete(opt.idx);
    }
    return null;
  }
}

function removeRedundant(cands, chosen, full) {
  let out = chosen.slice(), changed = true;
  while (changed) {
    changed = false;
    for (let i = out.length - 1; i >= 0; i -= 1) {
      const trial = out.filter((_, idx) => idx !== i);
      const mask = trial.reduce((m, idx) => m | cands[idx].mask, 0n);
      if (mask === full) { out = trial; changed = true; }
    }
  }
  return out;
}

function solve({ features, paperSize, orientation, scale, bufferMeters, overlapPct }) {
  const [wMM, hMM] = getPaperSizeMM(paperSize, orientation);
  const pageW = (wMM / 1000) * scale;
  const pageH = (hMM / 1000) * scale;
  const points = analysisPoints(features, pageW, pageH, bufferMeters);
  if (!points.length) return null;
  const cands = buildMasks(candidates(points, pageW, pageH, overlapPct), points);
  const full = (1n << BigInt(points.length)) - 1n;
  const g = greedy(cands, full);
  if (g.covered !== full) return null;
  let chosen = exactImprove(cands, full, g.chosen, points.length);
  chosen = removeRedundant(cands, chosen, full);
  return { rects: chosen.map((idx) => cands[idx]), pageW, pageH, scale, points };
}

function autoScales(features, paperSize, orientation, buffer) {
  const extent = features.reduce((acc, f) => {
    const g = f.getGeometry?.();
    if (!g) return acc;
    const e = expand(g.getExtent(), buffer);
    return acc ? ol.extent.extend(acc, e) : e.slice();
  }, null);
  if (!extent) return CONFIG.STANDARD_SCALES;
  const [wMM, hMM] = getPaperSizeMM(paperSize, orientation);
  const req = Math.max(((extent[2] - extent[0]) * 1000) / wMM, ((extent[3] - extent[1]) * 1000) / hMM);
  const standard = CONFIG.STANDARD_SCALES || [500, 750, 1000, 1250, 2500, 5000, 10000, 25000, 50000];
  const start = Math.max(0, standard.findIndex((s) => s >= req / 3));
  return standard.slice(start, Math.min(standard.length, start + 8));
}

export function generateSmartDdpIndex({ vectorSource, paperSize = "A4", orientation = "landscape", scale, bufferMeters = 0, overlapPct = 20 }) {
  const features = inputFeatures(vectorSource);
  if (!features.length) throw new Error("Draw or import at least one point, line, or polygon before creating DDP pages.");
  const fixedScale = Math.max(0, Number(scale) || 0);
  const scales = fixedScale > 0 ? [fixedScale] : autoScales(features, paperSize, orientation, bufferMeters);
  let best = null;
  for (const s of scales) {
    const result = solve({ features, paperSize, orientation, scale: s, bufferMeters, overlapPct });
    if (!result) continue;
    if (!best || result.rects.length < best.rects.length || (result.rects.length === best.rects.length && s < best.scale)) best = result;
  }
  if (!best) throw new Error("Could not create DDP coverage for these features at the selected settings.");

  return best.rects.slice().sort((a, b) => b.maxY - a.maxY || a.minX - b.minX).map((r, i) => {
    const f = new ol.Feature(rectToPolygon(r));
    f.setProperties({
      __truegis_ddp: true,
      page_no: i + 1,
      scale: best.scale,
      paper_size: paperSize,
      orientation,
      overlap_pct: Number(overlapPct),
      buffer_m: Number(bufferMeters),
      width_m: Math.round(best.pageW * 100) / 100,
      height_m: Math.round(best.pageH * 100) / 100,
    });
    return f;
  });
}

export function exportDdpGeoJSON({ ddpSource }) {
  const features = ddpSource.getFeatures().filter((f) => f.get("__truegis_ddp"));
  const obj = new ol.format.GeoJSON().writeFeaturesObject(features, { featureProjection: "EPSG:3857", dataProjection: "EPSG:4326" });
  return JSON.stringify(obj, null, 2);
}
