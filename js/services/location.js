export function centerOnUserLocation({ view }) {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const coords = ol.proj.fromLonLat([pos.coords.longitude, pos.coords.latitude]);
      view.setCenter(coords);
      view.setZoom(14);
    },
    () => {
      // silent fallback (matches your current behaviour)
    }
  );
}
