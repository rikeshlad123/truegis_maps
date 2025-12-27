import { initDrawTools } from "./drawTools.js";
import { initPreviewBox } from "./previewBox.js";
import { centerOnUserLocation } from "../services/location.js";

export function createMapApp({ store }) {
  const vectorSource = new ol.source.Vector();

  const vectorLayer = new ol.layer.Vector({
    source: vectorSource
  });

  const osmLayer = new ol.layer.Tile({
    source: new ol.source.OSM(),
    visible: true
  });

  const esriLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    }),
    visible: false
  });

  const view = new ol.View({
    center: ol.proj.fromLonLat([-1.9, 52.48]),
    zoom: 6
  });

  const map = new ol.Map({
    target: "map",
    layers: [osmLayer, esriLayer, vectorLayer],
    view
  });

  const preview = initPreviewBox({ map, vectorSource, store });

  const draw = initDrawTools({
    map,
    vectorSource,
    onChange: () => preview.update()
  });

  // match your current behaviour: attempt geolocation on load
  centerOnUserLocation({ view });

  return {
    map,
    view,
    vectorSource,
    layers: { osmLayer, esriLayer, vectorLayer },
    draw,
    preview
  };
}
