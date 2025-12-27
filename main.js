const inkmap = window['@camptocamp/inkmap'];

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('inkmap-sw.js')
    .then(() => console.log('[inkmap] Service worker registered'))
    .catch(err => console.warn('[inkmap] Service worker registration failed:', err));
}

window.onload = () => {
  const DPI = 150;
  const PAPER_SIZES = {
    landscape: [277, 170],
    portrait: [170, 277]
  };

  const vectorSource = new ol.source.Vector();
  const vectorLayer = new ol.layer.Vector({ source: vectorSource });

  const osmLayer = new ol.layer.Tile({
    source: new ol.source.OSM(),
    visible: true,
    title: 'OSM'
  });

const view = new ol.View({
  center: ol.proj.fromLonLat([0, 0]),
  zoom: 2
});

const map = new ol.Map({
  target: 'map',
  layers: [osmLayer, vectorLayer],
  view
});

function centerMapOnUserLocation() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const coords = ol.proj.fromLonLat([pos.coords.longitude, pos.coords.latitude]);
      view.setCenter(coords);
      view.setZoom(14);
    }
    // no onError, no fallback
  );
}


centerMapOnUserLocation();


  let drawInteraction = null;
  let previewFeature = null;

  function rgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function updatePreviewBox() {
    if (!document.getElementById('showPreview').checked) {
      if (previewFeature) vectorSource.removeFeature(previewFeature);
      previewFeature = null;
      return;
    }

    const scale = parseInt(document.getElementById('scale').value);
    const orientation = document.getElementById('orientation').value;
    const [widthMM, heightMM] = PAPER_SIZES[orientation];
    const center = map.getView().getCenter();
    const metersPerMM = scale / 1000;
    const width = widthMM * metersPerMM;
    const height = heightMM * metersPerMM;
    const extent = [
      center[0] - width / 2,
      center[1] - height / 2,
      center[0] + width / 2,
      center[1] + height / 2
    ];

    if (previewFeature) vectorSource.removeFeature(previewFeature);
    previewFeature = new ol.Feature(new ol.geom.Polygon.fromExtent(extent));
    previewFeature.setStyle(new ol.style.Style({
      stroke: new ol.style.Stroke({ color: 'red', width: 2, lineDash: [4] }),
      fill: new ol.style.Fill({ color: 'rgba(255, 0, 0, 0.1)' })
    }));
    vectorSource.addFeature(previewFeature);
  }

  function activateDraw(type) {
    if (drawInteraction) map.removeInteraction(drawInteraction);

    if (type === 'Square') {
      drawInteraction = new ol.interaction.Draw({
        source: vectorSource,
        type: 'Circle',
        geometryFunction: ol.interaction.Draw.createBox()
      });
    } else {
      drawInteraction = new ol.interaction.Draw({
        source: vectorSource,
        type: type === 'Circle' ? 'Circle' : type
      });
    }

    drawInteraction.on('drawend', (e) => {
      const fillColor = document.getElementById('fillColor').value;
      const fillOpacity = parseFloat(document.getElementById('fillOpacity').value);
      const strokeColor = document.getElementById('strokeColor').value;
      const strokeOpacity = parseFloat(document.getElementById('strokeOpacity').value);
      const strokeWidth = parseInt(document.getElementById('strokeWidth').value);

      e.feature.setProperties({ fillColor, fillOpacity, strokeColor, strokeOpacity, strokeWidth });

      const geomType = e.feature.getGeometry().getType();

      const style = (geomType === 'Point')
        ? new ol.style.Style({
            image: new ol.style.Circle({
              radius: 6,
              fill: new ol.style.Fill({ color: fillColor }),
              stroke: new ol.style.Stroke({ color: strokeColor, width: 1 })
            })
          })
        : new ol.style.Style({
            stroke: new ol.style.Stroke({ color: rgba(strokeColor, strokeOpacity), width: strokeWidth }),
            fill: new ol.style.Fill({ color: rgba(fillColor, fillOpacity) })
          });

      e.feature.setStyle(style);
      updatePreviewBox();
    });


    map.addInteraction(drawInteraction);
  }

  document.getElementById('drawPoint').onclick = () => activateDraw('Point');
  document.getElementById('drawLine').onclick = () => activateDraw('LineString');
  document.getElementById('drawPolygon').onclick = () => activateDraw('Polygon');
  document.getElementById('drawCircle').onclick = () => activateDraw('Circle');
  document.getElementById('drawSquare').onclick = () => activateDraw('Square');

  document.getElementById('clearDrawings').onclick = () => {
    vectorSource.clear();
    updatePreviewBox();
  };

  document.getElementById('print').onclick = async () => {
    const orientation = document.getElementById('orientation').value;
    const [widthMM, heightMM] = PAPER_SIZES[orientation];
    const scale = parseInt(document.getElementById('scale').value);
    const center = ol.proj.toLonLat(map.getView().getCenter());

    const features = vectorSource.getFeatures().filter(f => f !== previewFeature);

    const isOSM = osmLayer.getVisible();

    const layers = [
      {
        type: 'XYZ',
        url: isOSM
          ? 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: isOSM
          ? '© OpenStreetMap contributors'
          : '© Esri & contributors'
      }
    ];

    for (const [i, feature] of features.entries()) {
      const fillColor = feature.get('fillColor');
      const fillOpacity = feature.get('fillOpacity');
      const strokeColor = feature.get('strokeColor');
      const strokeOpacity = feature.get('strokeOpacity');
      const strokeWidth = feature.get('strokeWidth');

      const json = JSON.parse(new ol.format.GeoJSON().writeFeature(feature, {
        dataProjection: 'EPSG:3857',
        featureProjection: 'EPSG:3857'
      }));

      const geomType = json.geometry.type;
      let symbolizers = [];

      if (geomType === 'Point') {
        symbolizers.push({
          kind: 'Mark',
          wellKnownName: 'circle',
          radius: 6,
          color: fillColor,
          strokeColor,
          strokeWidth: 1
        });
      } else if (geomType === 'LineString') {
        symbolizers.push({
          kind: 'Line',
          color: rgba(strokeColor, strokeOpacity),
          width: strokeWidth
        });
      } else if (geomType === 'Polygon') {
        symbolizers.push({
          kind: 'Fill',
          color: rgba(fillColor, fillOpacity),
          outlineColor: rgba(strokeColor, strokeOpacity),
          outlineWidth: strokeWidth
        });
        symbolizers.push({
          kind: 'Line',
          color: rgba(strokeColor, strokeOpacity),
          width: strokeWidth
        });
      } else {
        continue;
      }

      layers.push({
        type: 'GeoJSON',
        geojson: {
          type: 'FeatureCollection',
          features: [json]
        },
        style: {
          name: `Feature ${i + 1}`,
          rules: [{ symbolizers }]
        }
      });
    }

    const spec = {
      layers,
      center,
      projection: 'EPSG:3857',
      scale,
      dpi: DPI,
      size: [widthMM, heightMM, 'mm'],
      scaleBar: { position: 'bottom-left', units: 'metric' },
      northArrow: 'top-right',
      attributions: 'bottom-right'
    };

    try {
      const blob = await inkmap.print(spec);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error('❌ Inkmap error:', err);
      alert('Print failed. See console.');
    }
  };

  document.getElementById('quickPrint').onclick = () => {
    const isOSM = osmLayer.getVisible();
    if (!isOSM) {
      alert('Quick Print only works with OSM basemap due to browser security limits.');
      return;
    }

    const canvas = map.getViewport().querySelector('canvas');
    if (!canvas) return alert('Canvas not available.');
    const url = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    win.document.write(`<img src="${url}" alt="Map Snapshot" />`);
  };

  document.getElementById('searchBtn').onclick = async () => {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return alert('Enter a place to search');

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.length > 0) {
        const [lon, lat] = [parseFloat(data[0].lon), parseFloat(data[0].lat)];
        map.getView().setCenter(ol.proj.fromLonLat([lon, lat]));
        map.getView().setZoom(15);
      } else {
        alert('No results found.');
      }
    } catch (err) {
      console.error(err);
      alert('Search failed.');
    }
  };

  document.getElementById('locateBtn').onclick = () => {
    if (!navigator.geolocation) return alert('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = ol.proj.fromLonLat([pos.coords.longitude, pos.coords.latitude]);
        map.getView().setCenter(coords);
        map.getView().setZoom(15);
      },
      (err) => {
        console.error(err);
        alert('Could not get location.');
      }
    );
  };

  document.getElementById('scale').onchange = updatePreviewBox;
  document.getElementById('orientation').onchange = updatePreviewBox;
  document.getElementById('showPreview').onchange = updatePreviewBox;
  map.getView().on('change:center', updatePreviewBox);
  map.getView().on('change:resolution', updatePreviewBox);
  updatePreviewBox();
};
