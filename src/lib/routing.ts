import type { Instruction, LatLng, Place, Route } from "./types";
import { densify, pathLength } from "./geo";

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    street?: string;
  };
};

type OsrmStep = {
  name?: string;
  ref?: string;
  distance?: number;
  maneuver?: { type?: string; modifier?: string };
};

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { steps: OsrmStep[] }[];
};

export async function geocodePlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=7&lang=en`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("geocode failed");
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const f of data.features ?? []) {
    const [lng, lat] = f.geometry.coordinates;
    const p = f.properties;
    const name = p.name?.trim();
    if (!name || Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const key = `${name.toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const subtitle = [p.street, p.city, p.state, p.country].filter(Boolean).filter((s) => s !== name).join(" · ");
    out.push({
      id: `geo-${p.osm_id ?? `${lat.toFixed(4)}-${lng.toFixed(4)}`}`,
      name,
      kind: p.osm_value === "city" || p.osm_key === "place" ? "city" : "yard",
      subtitle: subtitle || "Live map",
      coord: { lat, lng },
    });
  }
  return out;
}

function turnLine(step: OsrmStep): { primary: string; secondary: string } {
  const name = step.ref || step.name || "the road";
  const type = step.maneuver?.type ?? "turn";
  const mod = (step.maneuver?.modifier ?? "").replace("uturn", "U-turn");
  if (type === "depart") return { primary: "Head out", secondary: name };
  if (type === "arrive") return { primary: "Arrive", secondary: name };
  if (type === "roundabout" || type === "rotary") return { primary: "Roundabout", secondary: name };
  if (type === "on ramp") return { primary: "Take the ramp", secondary: name };
  if (type === "off ramp" || type === "exit roundabout") return { primary: `Exit ${mod}`.trim(), secondary: name };
  if (type === "merge") return { primary: "Merge", secondary: name };
  if (type === "fork") return { primary: `Keep ${mod || "ahead"}`.trim(), secondary: name };
  const action = mod ? `${type} ${mod}` : type;
  return { primary: action.replace(/^\w/, (c) => c.toUpperCase()), secondary: name };
}

export async function fetchDrivingRoute(from: LatLng, to: Place, signal?: AbortSignal): Promise<Route | null> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.coord.lng},${to.coord.lat}` +
    `?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { code?: string; routes?: OsrmRoute[] };
  const raw = data.routes?.[0];
  if (!raw?.geometry?.coordinates?.length) return null;

  const coords = raw.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  const polyline = densify(coords, 1.2);
  const distanceMi = pathLength(polyline) || raw.distance / 1609.34;
  const durationMin = Math.max(1, Math.round(raw.duration / 60));

  const steps = raw.legs.flatMap((l) => l.steps ?? []);
  const instructions: Instruction[] = [];
  let accMi = 0;
  for (const step of steps) {
    const skip = step.maneuver?.type === "new name" && instructions.length > 0;
    if (!skip) {
      const line = turnLine(step);
      instructions.push({ atMi: accMi, primary: line.primary, secondary: line.secondary });
    }
    accMi += (step.distance ?? 0) / 1609.34;
  }
  if (instructions.length === 0) {
    instructions.push({ atMi: 0, primary: "Head toward destination", secondary: to.name });
  }
  const last = instructions[instructions.length - 1];
  if (!last || last.primary !== "Arrive") {
    instructions.push({ atMi: Math.max(0, distanceMi - 0.2), primary: "Arrive", secondary: to.name });
  }

  const highways = [...new Set(steps.map((s) => s.ref || s.name).filter((n): n is string => Boolean(n && n !== "-")))].slice(0, 4);

  return {
    id: `live-${to.id}`,
    fromId: "origin",
    toId: to.id,
    polyline,
    distanceMi,
    durationMin,
    highways: highways.length ? highways : ["Local roads"],
    restrictions: [],
    traffic: [],
    instructions,
  };
}
