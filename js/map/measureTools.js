/**
 * Measure tools (OpenLayers)
 * - Distance (LineString) and Area (Polygon)
 * - Uses a dedicated vector layer + tooltip overlay
 * - Designed to be toggled on/off cleanly without affecting your main draw/edit tools
 *
 * Fixes in this version:
 * - Properly unbinds geometry change listeners (prevents leaks + weird repeated updates)
 * - Always hides tooltip on deactivate/clear
 * - Ensures measure interactions never touch your main vectorSource/history
 * - Adds a small guard so measure clicks don’t accidentally count as “map context” for other logic
 *
 * Usage:
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
    display: none;
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

  // We store the current geometry + listener key so we can unbind cleanly
  let sketchGeom = null;
  let geomChangeKey = null;

  // Use geodesic calculations for Web Mercator maps
  const sphere = ol.sphere;

  function formatLength(line) {
    const length = sphere.getLength(line, {
      projection: map.getView().getProjection(),
    });
    if (length > 1000) return `${(length / 1000).toFixed(2)} km`;
    return `${length.toFixed(1)} m`;
  }

  function formatArea(poly) {
    const area = sphere.getArea(poly, {
      projection: map.getView().getProjection(),
    });
    if (area > 1e6) return `${(area / 1e6).toFixed(2)} km²`;
    return `${area.toFixed(1)} m²`;
  }

  function hideTooltip() {
    tooltipEl.style.display = "none";
    tooltip.setPosition(undefined);
  }

  function showTooltip(text, coord) {
    if (!coord || !text) return;
    tooltipEl.textContent = text;
    tooltip.setPosition(coord);
    tooltipEl.style.display = "block";
  }

  function updateTooltipForGeom(geom) {
    if (!geom) return;

    const t = geom.getType();
    if (t === "LineString") {
      const text = formatLength(geom);
      const coord = geom.getLastCoordinate();
      showTooltip(text, coord);
    } else if (t === "Polygon") {
      const text = formatArea(geom);
      const coord = geom.getInteriorPoint().getCoordinates();
      showTooltip(text, coord);
    }
  }

  function detachGeomListener() {
    if (geomChangeKey) {
      ol.Observable.unByKey(geomChangeKey);
      geomChangeKey = null;
    }
    sketchGeom = null;
  }

  function deactivate() {
    if (draw) {
      map.removeInteraction(draw);
      draw = null;
    }

    detachGeomListener();

    sketch = null;
    mode = null;
    hideTooltip();
  }

  function activate(nextMode) {
    deactivate();

    mode = nextMode;
    const type = mode === "area" ? "Polygon" : "LineString";

    draw = new ol.interaction.Draw({
      source,
      type,
      // Make sure measure doesn't interfere with other click logic elsewhere
      // (e.g. select interactions) by stopping event propagation where OL supports it
      // Note: OL handles pointer events internally; this is just a harmless hint.
      stopClick: true,
    });

    draw.on("drawstart", (evt) => {
      sketch = evt.feature;

      detachGeomListener();

      sketchGeom = sketch.getGeometry();
      updateTooltipForGeom(sketchGeom);

      // live updates while drawing (unbind on deactivate/drawend)
      geomChangeKey = sketchGeom.on("change", () => updateTooltipForGeom(sketchGeom));
    });

    draw.on("drawend", () => {
      // keep last value visible at end position
      if (sketchGeom) updateTooltipForGeom(sketchGeom);

      // stop live tracking after finish (avoids leaks)
      detachGeomListener();

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
    sketch = null;
    detachGeomListener();
    hideTooltip();
  }

  return {
    setMode,
    getMode,
    clear,
    layer,
    source,
  };
}
