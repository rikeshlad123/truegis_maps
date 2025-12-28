/**
 * Measure tools (OpenLayers)
 * - Distance (LineString) and Area (Polygon)
 * - Uses a dedicated vector layer + tooltip overlay
 * - Designed to be toggled on/off cleanly without affecting your main draw/edit tools
 *
 * Usage:
 *   import { initMeasureTools } from "./measureTools.js";
 *   const measure = initMeasureTools({ map });
 *   measure.setMode("line");   // start measuring distance
 *   measure.setMode("area");   // start measuring area
 *   measure.setMode(null);     // turn off
 *   measure.clear();           // clear measurements
 */

export function initMeasureTools({ map }) {
  const source = new ol.source.Vector();
  const layer = new ol.layer.Vector({
    source,
    // Keep measure visuals simple and readable; don’t depend on app style props
    style: new ol.style.Style({
      fill: new ol.style.Fill({ color: "rgba(255,255,255,0.2)" }),
      stroke: new ol.style.Stroke({ color: "rgba(0,0,0,0.9)", width: 2 }),
      image: new ol.style.Circle({
        radius: 5,
        fill: new ol.style.Fill({ color: "rgba(0,0,0,0.9)" }),
        stroke: new ol.style.Stroke({ color: "rgba(255,255,255,1)", width: 2 }),
      }),
    }),
  });

  map.addLayer(layer);

  // Tooltip overlay element
  const tooltipEl = document.createElement("div");
  tooltipEl.className = "truegis-measure-tooltip";
  tooltipEl.style.cssText = `
    position: absolute;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 6px 8px;
    border-radius: 8px;
    font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    white-space: nowrap;
    transform: translate(-50%, -120%);
    pointer-events: none;
  `;

  const tooltip = new ol.Overlay({
    element: tooltipEl,
    offset: [0, 0],
    positioning: "bottom-center",
    stopEvent: false,
  });

  map.addOverlay(tooltip);

  let draw = null;
  let mode = null; // "line" | "area" | null
  let sketch = null;

  // Use geodesic calculations for Web Mercator maps
  const sphere = ol.sphere;

  function formatLength(line) {
    const length = sphere.getLength(line, { projection: map.getView().getProjection() });
    if (length > 1000) return `${(length / 1000).toFixed(2)} km`;
    return `${length.toFixed(1)} m`;
  }

  function formatArea(poly) {
    const area = sphere.getArea(poly, { projection: map.getView().getProjection() });
    if (area > 1e6) return `${(area / 1e6).toFixed(2)} km²`;
    return `${area.toFixed(1)} m²`;
  }

  function updateTooltip(geom) {
    if (!geom) return;

    let output = "";
    let coord = null;

    if (geom.getType() === "LineString") {
      output = formatLength(geom);
      coord = geom.getLastCoordinate();
    } else if (geom.getType() === "Polygon") {
      output = formatArea(geom);
      coord = geom.getInteriorPoint().getCoordinates();
    }

    if (!coord) return;

    tooltipEl.textContent = output;
    tooltip.setPosition(coord);
    tooltipEl.style.display = output ? "block" : "none";
  }

  function deactivate() {
    if (draw) {
      map.removeInteraction(draw);
      draw = null;
    }
    sketch = null;
    mode = null;
    tooltipEl.style.display = "none";
  }

  function activate(nextMode) {
    deactivate();

    mode = nextMode;
    const type = mode === "area" ? "Polygon" : "LineString";

    draw = new ol.interaction.Draw({
      source,
      type,
    });

    draw.on("drawstart", (evt) => {
      sketch = evt.feature;
      tooltipEl.style.display = "block";

      // live updates while drawing
      const geom = sketch.getGeometry();
      geom.on("change", () => updateTooltip(geom));
    });

    draw.on("drawend", () => {
      // leave the last tooltip visible on the drawn feature’s last point
      const geom = sketch?.getGeometry?.();
      updateTooltip(geom);
      sketch = null;
    });

    map.addInteraction(draw);
  }

  /**
   * Set measure mode:
   *  - "line": distance
   *  - "area": polygon area
   *  - null: off
   */
  function setMode(nextMode) {
    if (nextMode !== "line" && nextMode !== "area" && nextMode !== null) {
      throw new Error(`Invalid measure mode: ${nextMode}`);
    }
    if (nextMode === null) {
      deactivate();
      return;
    }
    activate(nextMode);
  }

  function getMode() {
    return mode;
  }

  function clear() {
    source.clear(true);
    tooltipEl.style.display = "none";
  }

  return {
    setMode,
    getMode,
    clear,
    layer,
    source,
  };
}
