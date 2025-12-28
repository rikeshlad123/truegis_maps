import { rgba } from "../utils/colors.js";

/**
 * Draw tools (OpenLayers) + feature styling.
 * Stores style props on each feature so Inkmap can reuse them.
 */
export function initDrawTools({ map, vectorSource, onChange }) {
  let drawInteraction = null;

  function styleFeature(feature, styleProps) {
    const { fillColor, fillOpacity, strokeColor, strokeOpacity, strokeWidth } = styleProps;

    // Store on feature for printing + persistence
    feature.setProperties({
      fillColor,
      fillOpacity,
      strokeColor,
      strokeOpacity,
      strokeWidth,
    });

    const geomType = feature.getGeometry().getType();

    const style =
      geomType === "Point"
        ? new ol.style.Style({
            image: new ol.style.Circle({
              radius: 6,
              fill: new ol.style.Fill({ color: rgba(fillColor, fillOpacity) }),
              stroke: new ol.style.Stroke({
                color: rgba(strokeColor, strokeOpacity),
                width: Math.max(1, strokeWidth),
              }),
            }),
          })
        : new ol.style.Style({
            stroke: new ol.style.Stroke({
              color: rgba(strokeColor, strokeOpacity),
              width: Math.max(1, strokeWidth),
            }),
            fill: new ol.style.Fill({
              color: rgba(fillColor, fillOpacity),
            }),
          });

    feature.setStyle(style);
  }

  function makeBoxGeometryFunction() {
    return ol.interaction.Draw.createBox();
  }

  function makeSquareGeometryFunction() {
    return (coordinates, geometry) => {
      const start = coordinates[0];
      const end = coordinates[1];

      const dx = end[0] - start[0];
      const dy = end[1] - start[1];

      const size = Math.max(Math.abs(dx), Math.abs(dy));
      const x2 = start[0] + Math.sign(dx || 1) * size;
      const y2 = start[1] + Math.sign(dy || 1) * size;

      const coords = [[
        start,
        [x2, start[1]],
        [x2, y2],
        [start[0], y2],
        start
      ]];

      if (!geometry) geometry = new ol.geom.Polygon(coords);
      else geometry.setCoordinates(coords);
      return geometry;
    };
  }

  function deactivate() {
    if (drawInteraction) {
      map.removeInteraction(drawInteraction);
      drawInteraction = null;
    }
  }

  /**
   * Activate a draw mode.
   * type: "Point" | "LineString" | "Polygon" | "Circle" | "Rectangle" | "Square"
   */
  function activate(type, getStyleProps) {
    deactivate();

    const isBox = type === "Rectangle";
    const isSquare = type === "Square";

    drawInteraction = new ol.interaction.Draw({
      source: vectorSource,
      type: (isBox || isSquare) ? "Circle" : type, // OL trick
      geometryFunction: isBox
        ? makeBoxGeometryFunction()
        : isSquare
        ? makeSquareGeometryFunction()
        : undefined,

      // Sketch style while drawing
      style: () => {
        const { fillColor, fillOpacity, strokeColor, strokeOpacity, strokeWidth } = getStyleProps();
        return new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: rgba(strokeColor, strokeOpacity),
            width: Math.max(1, strokeWidth),
          }),
          fill: new ol.style.Fill({
            color: rgba(fillColor, fillOpacity),
          }),
          image: new ol.style.Circle({
            radius: 6,
            fill: new ol.style.Fill({ color: rgba(fillColor, fillOpacity) }),
            stroke: new ol.style.Stroke({
              color: rgba(strokeColor, strokeOpacity),
              width: Math.max(1, strokeWidth),
            }),
          }),
        });
      },
    });

    drawInteraction.on("drawend", (e) => {
      styleFeature(e.feature, getStyleProps());
      onChange?.();
    });

    map.addInteraction(drawInteraction);
  }

  function clear() {
    vectorSource.clear();
    onChange?.();
  }

  return { activate, deactivate, clear, styleFeature };
}
