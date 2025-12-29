import { CONFIG } from "../config.js";

/**
 * Preview box stored in same vectorSource, but tagged so it can be excluded.
 */
export function initPreviewBox({ map, vectorSource, store }) {
  let previewFeature = null;

  function ensurePreviewFeature() {
    if (previewFeature) return previewFeature;

    previewFeature = new ol.Feature(new ol.geom.Polygon([]));

    // ✅ Tag it so export/history can ignore it
    previewFeature.set("__truegis_preview", true);

    previewFeature.setStyle(
      new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: "red",
          width: 2,
          lineDash: [6, 6],
        }),
        fill: new ol.style.Fill({
          color: "rgba(255, 0, 0, 0.10)",
        }),
      })
    );

    vectorSource.addFeature(previewFeature);
    return previewFeature;
  }

  function removePreviewFeature() {
    if (!previewFeature) return;
    vectorSource.removeFeature(previewFeature);
    previewFeature = null;
  }

  function update() {
    const { showPreview, scale, orientation } = store.getState();

    if (!showPreview) {
      removePreviewFeature();
      return;
    }

    const [widthMM, heightMM] =
      CONFIG.PAPER_SIZES[orientation] || CONFIG.PAPER_SIZES.landscape;

    const center = map.getView().getCenter();
    if (!center) return;

    const metersPerMM = Number(scale) / 1000;
    const width = widthMM * metersPerMM;
    const height = heightMM * metersPerMM;

    const extent = [
      center[0] - width / 2,
      center[1] - height / 2,
      center[0] + width / 2,
      center[1] + height / 2,
    ];

    const f = ensurePreviewFeature();
    f.setGeometry(ol.geom.Polygon.fromExtent(extent));
  }

  const view = map.getView();
  view.on("change:center", update);
  view.on("change:resolution", update);

  store.subscribe(update);

  // initial
  update();

  return {
    update,
    getPreviewFeature: () => previewFeature,
  };
}
