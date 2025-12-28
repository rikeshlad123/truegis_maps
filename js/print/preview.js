import { CONFIG } from "../config.js";

/**
 * Preview box as a red dashed rectangle feature stored in the SAME vectorSource.
 * Tagged "__truegis_preview" so it can be excluded from print/export.
 */
export function initPreviewBox({ map, vectorSource, store }) {
  let previewFeature = null;

  function update() {
    const { showPreview, scale, orientation } = store.getState();

    if (!showPreview) {
      if (previewFeature) vectorSource.removeFeature(previewFeature);
      previewFeature = null;
      return;
    }

    const [widthMM, heightMM] =
      CONFIG.PAPER_SIZES[orientation] || CONFIG.PAPER_SIZES.landscape;

    const center = map.getView().getCenter();
    const metersPerMM = Number(scale) / 1000;
    const width = widthMM * metersPerMM;
    const height = heightMM * metersPerMM;

    const extent = [
      center[0] - width / 2,
      center[1] - height / 2,
      center[0] + width / 2,
      center[1] + height / 2,
    ];

    if (previewFeature) vectorSource.removeFeature(previewFeature);

    previewFeature = new ol.Feature(new ol.geom.Polygon.fromExtent(extent));

    // ✅ critical: mark it as preview
    previewFeature.set("__truegis_preview", true);

    previewFeature.setStyle(
      new ol.style.Style({
        stroke: new ol.style.Stroke({ color: "red", width: 2, lineDash: [4] }),
        fill: new ol.style.Fill({ color: "rgba(255, 0, 0, 0.1)" }),
      })
    );

    vectorSource.addFeature(previewFeature);
  }

  const view = map.getView();
  view.on("change:center", update);
  view.on("change:resolution", update);
  store.subscribe(update);

  update();

  return {
    update,
    getPreviewFeature: () => previewFeature,
  };
}
