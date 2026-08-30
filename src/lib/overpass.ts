import type { Facility, LatLng } from "./types";

const OVERPASS = "https://maps.mail.ru/osm/tools/overpass/api/interpreter";

type OsmEl = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function coordOf(el: OsmEl): LatLng | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function classify(tags: Record<string, string>): Facility["type"] | null {
  const amenity = tags.amenity ?? "";
  const highway = tags.highway ?? "";
  if (amenity === "weighbridge" || amenity === "weigh_station" || tags.enforcement === "weighbridge") return "weigh_station";
  if (highway === "rest_area") return "rest_area";
  if (amenity === "parking" && (tags.hgv === "yes" || tags.truck === "yes")) return "parking";
  if (amenity === "fuel" || amenity === "truck_stop" || highway === "services") return "truck_stop";
  return null;
}

export async function fetchNearbyStops(at: LatLng, signal?: AbortSignal): Promise<Facility[]> {
  const q = `[out:json][timeout:18];
(
  nwr["amenity"="fuel"](around:16000,${at.lat},${at.lng});
  nwr["amenity"="truck_stop"](around:16000,${at.lat},${at.lng});
  nwr["highway"="services"](around:16000,${at.lat},${at.lng});
  nwr["highway"="rest_area"](around:16000,${at.lat},${at.lng});
  nwr["amenity"="weighbridge"](around:16000,${at.lat},${at.lng});
  nwr["amenity"="parking"]["hgv"="yes"](around:16000,${at.lat},${at.lng});
);
out center 36;`;
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "text/plain", Accept: "application/json" },
    body: q,
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { elements?: OsmEl[] };
  const out: Facility[] = [];
  const seen = new Set<string>();
  for (const el of data.elements ?? []) {
    const coord = coordOf(el);
    const tags = el.tags ?? {};
    const type = classify(tags);
    if (!coord || !type) continue;
    const key = `${coord.lat.toFixed(4)}|${coord.lng.toFixed(4)}|${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = tags.name || tags.brand || tags.operator || (type === "weigh_station" ? "Weigh station" : type === "rest_area" ? "Rest area" : "Fuel stop");
    out.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      subtitle: [tags.brand, tags["addr:street"], tags["addr:city"]].filter(Boolean).join(" · ") || "OpenStreetMap",
      type,
      coord,
      diesel: null,
      def: null,
      parking: { open: 0, total: 0 },
      amenities: type === "truck_stop" ? ["parking"] : type === "rest_area" ? ["parking"] : [],
      rating: 4.2,
    });
    if (out.length >= 28) break;
  }
  return out;
}
