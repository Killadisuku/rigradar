import { haversine } from "./geo";
import { fetchNearbyStops } from "./overpass";
import { reverseGeocode } from "./routing";
import { useApp } from "./store";
import type { LatLng } from "./types";

let watchId: number | null = null;
let lastLabelAt = 0;
let lastLabel: LatLng = { lat: 0, lng: 0 };
let lastStopsAt = 0;
let lastStops: LatLng = { lat: 0, lng: 0 };
let labelAbort: AbortController | null = null;
let stopsAbort: AbortController | null = null;

export function startGps() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    useApp.getState().setGpsStatus("denied");
    return;
  }
  if (watchId != null) return;
  useApp.getState().setGpsStatus("pending");
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const c = pos.coords;
      const coord = { lat: c.latitude, lng: c.longitude };
      const heading = c.heading == null || Number.isNaN(Number(c.heading)) ? -1 : Number(c.heading);
      const speedMph = c.speed == null || c.speed < 0 ? 0 : c.speed * 2.236936;
      useApp.getState().applyGpsFix({
        coord,
        heading,
        speedMph,
        accuracyM: c.accuracy || 35,
        at: Date.now(),
      });
      void maybeLabel(coord);
      void maybeStops(coord);
    },
    (err) => {
      useApp.getState().setGpsStatus(err.code === 1 ? "denied" : "pending");
    },
    { enableHighAccuracy: true, maximumAge: 1200, timeout: 20000 },
  );
}

export function stopGps() {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  labelAbort?.abort();
  stopsAbort?.abort();
}

async function maybeLabel(coord: LatLng) {
  const moved = haversine(lastLabel, coord);
  if (Date.now() - lastLabelAt < 18000 && moved < 0.35) return;
  lastLabelAt = Date.now();
  lastLabel = coord;
  labelAbort?.abort();
  const ac = new AbortController();
  labelAbort = ac;
  try {
    const label = await reverseGeocode(coord, ac.signal);
    if (!ac.signal.aborted) useApp.getState().setOriginLabel(label);
  } catch {
    /* keep last label */
  }
}

async function maybeStops(coord: LatLng) {
  const moved = haversine(lastStops, coord);
  if (Date.now() - lastStopsAt < 35000 && moved < 1.6) return;
  lastStopsAt = Date.now();
  lastStops = coord;
  stopsAbort?.abort();
  const ac = new AbortController();
  stopsAbort = ac;
  try {
    const stops = await fetchNearbyStops(coord, ac.signal);
    if (!ac.signal.aborted) useApp.getState().setExtraFacilities(stops);
  } catch {
    /* keep last stops */
  }
}
