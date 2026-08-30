import { plotOrsRoute } from "./ors";
import type { Instruction, LatLng, Place, Restriction, Route, TruckProfile } from "./types";
import { densify, haversine, pathLength } from "./geo";

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

export async function geocodePlaces(q: string, signal?: AbortSignal, near?: LatLng): Promise<Place[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : "";
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=7&lang=en${bias}`;
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

export async function reverseGeocode(coord: LatLng, signal?: AbortSignal): Promise<string> {
  const url = `https://photon.komoot.io/reverse?lat=${coord.lat}&lon=${coord.lng}&lang=en`;
  const res = await fetch(url, { signal });
  if (!res.ok) return "Your location";
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const p = data.features?.[0]?.properties;
  if (!p) return "Your location";
  const bits = [p.name, p.city, p.state, p.country].filter(Boolean);
  const uniq = [...new Set(bits)];
  return uniq.slice(0, 3).join(" · ") || "Your location";
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
    highways: highways.length ? highways : ["Highway"],
    restrictions: [],
    traffic: [],
    instructions,
  };
}

const HINT: Record<number, string> = {
  1: "Continue",
  2: "Turn left",
  3: "Slight left",
  4: "Sharp left",
  5: "Turn right",
  6: "Slight right",
  7: "Sharp right",
  8: "U-turn",
  10: "Keep left",
  11: "Keep right",
  13: "Roundabout",
  14: "Take the ramp",
};

function parseTags(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(/\s+/)) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

function parseHeightM(raw: string): number | null {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*m/i);
  if (m) return Number(m[1]);
  const ft = raw.match(/(\d+)\s*['′]/);
  if (ft) {
    const inch = raw.match(/(\d+)\s*[\"″]/);
    return (Number(ft[1]) + (inch ? Number(inch[1]) / 12 : 0)) * 0.3048;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n > 2 && n < 8) return n;
  if (n >= 8 && n <= 18) return n * 0.3048;
  return null;
}

function parseWeightT(raw: string): number | null {
  const t = raw.match(/(\d+(?:\.\d+)?)\s*t/i);
  if (t) return Number(t[1]);
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n > 2 && n < 80) return n;
  return null;
}

function tollNogos(rows: string[][]): string {
  const pts: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const tags = parseTags(row[9] ?? "");
    if (tags.toll !== "yes" && tags.fee !== "yes") continue;
    const lon = Number(row[0]) / 1e6;
    const lat = Number(row[1]) / 1e6;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = `${lon.toFixed(4)},${lat.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push(`${lon},${lat},40`);
    if (pts.length >= 24) break;
  }
  return pts.join("|");
}

async function fetchBrouterRoute(
  from: LatLng,
  to: Place,
  profile: TruckProfile,
  signal?: AbortSignal,
  avoidTolls = false,
  nogos = "",
): Promise<Route | null> {
  const extra = [
    avoidTolls ? "avoid_toll=true" : "",
    nogos ? `nogos=${encodeURIComponent(nogos)}` : "",
  ]
    .filter(Boolean)
    .join("&");
  const url =
    `https://brouter.de/brouter?lonlats=${from.lng},${from.lat}|${to.coord.lng},${to.coord.lat}` +
    `&profile=car-fast&alternativeidx=0&format=geojson${extra ? `&${extra}` : ""}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    features?: {
      geometry?: { coordinates?: [number, number][] };
      properties?: {
        "track-length"?: string;
        "total-time"?: string;
        messages?: string[][];
        voicehints?: number[][];
      };
    }[];
  };
  const feat = data.features?.[0];
  const coords = feat?.geometry?.coordinates;
  if (!feat || !coords?.length) return null;
  const polyline = densify(
    coords.map(([lng, lat]) => ({ lat, lng })),
    0.9,
  );
  const distanceMi = pathLength(polyline) || Number(feat.properties?.["track-length"] ?? 0) / 1609.34;
  const durationMin = Math.max(1, Math.round(Number(feat.properties?.["total-time"] ?? 0) / 60) || Math.round((distanceMi / 55) * 60));

  const messages = feat.properties?.messages ?? [];
  const tagRows = messages.slice(1);
  const highways: string[] = [];
  const restrictions: Restriction[] = [];
  let accMi = 0;
  const heightM = profile.heightFt * 0.3048;
  const weightT = profile.weightLbs / 2204.62;
  for (const row of tagRows) {
    const distM = Number(row[3] ?? 0);
    const tags = parseTags(row[9] ?? "");
    const ref = tags.ref || tags.highway;
    if (tags.ref && !highways.includes(tags.ref) && highways.length < 5) highways.push(tags.ref);
    else if (ref && highways.length === 0) highways.push(ref);
    if (tags.hgv === "no") {
      restrictions.push({ atMi: accMi, type: "weight", label: "HGV restriction on this stretch" });
    }
    if (tags.maxheight) {
      const h = parseHeightM(tags.maxheight);
      if (h != null && h + 0.05 < heightM) {
        restrictions.push({
          atMi: accMi,
          type: "low_bridge",
          label: `Low clearance ${tags.maxheight} — check your ${profile.heightFt.toFixed(1)} ft`,
          heightFt: h / 0.3048,
        });
      }
    }
    if (tags.maxweight) {
      const w = parseWeightT(tags.maxweight);
      if (w != null && w + 0.5 < weightT) {
        restrictions.push({ atMi: accMi, type: "weight", label: `Weight limit ${tags.maxweight}` });
      }
    }
    if (profile.hazmat && (tags.hazmat === "no" || tags.hgv === "no")) {
      restrictions.push({ atMi: accMi, type: "hazmat", label: "Hazmat restricted" });
    }
    accMi += distM / 1609.34;
  }

  const instructions: Instruction[] = [];
  const hints = feat.properties?.voicehints ?? [];
  if (hints.length) {
    for (const h of hints) {
      const idx = h[0] ?? 0;
      const cmd = h[1] ?? 1;
      const at = Math.min(distanceMi, (idx / Math.max(1, coords.length - 1)) * distanceMi);
      const tags = parseTags(tagRows[Math.min(idx, tagRows.length - 1)]?.[9] ?? "");
      instructions.push({
        atMi: at,
        primary: HINT[cmd] ?? "Continue",
        secondary: tags.ref || tags.name || tags.highway || "truck route",
      });
    }
  }
  if (instructions.length === 0) {
    instructions.push({ atMi: 0, primary: "Head out on truck route", secondary: highways[0] ?? to.name });
  }
  instructions.push({ atMi: Math.max(0, distanceMi - 0.2), primary: "Arrive", secondary: to.name });

  if (avoidTolls && !nogos) {
    const block = tollNogos(tagRows);
    if (block) {
      try {
        const rerouted = await fetchBrouterRoute(from, to, profile, signal, true, block);
        if (rerouted) return rerouted;
      } catch {
        /* keep this route and flag tolls */
      }
      restrictions.unshift({ atMi: 0, type: "weight", label: "Could not skip every toll — check gates" });
    }
  }

  return {
    id: `truck-${to.id}`,
    fromId: "origin",
    toId: to.id,
    polyline,
    distanceMi,
    durationMin,
    highways: highways.length ? highways : ["Truck route"],
    restrictions: restrictions.slice(0, 8),
    traffic: [],
    instructions,
  };
}

export async function fetchTruckRoute(
  from: LatLng,
  to: Place,
  profile: TruckProfile,
  avoidTolls = false,
  signal?: AbortSignal,
): Promise<Route | null> {
  const miles = haversine(from, to.coord);
  if (miles < 0.05) return null;
  try {
    const ors = await plotOrsRoute({
      data: {
        from,
        to: { id: to.id, name: to.name, lat: to.coord.lat, lng: to.coord.lng },
        heightFt: profile.heightFt,
        weightLbs: profile.weightLbs,
        lengthFt: profile.lengthFt,
        hazmat: profile.hazmat,
        avoidTolls,
      },
    });
    if (ors) return ors;
  } catch {
    /* fall through */
  }
  if (signal?.aborted) return null;
  if (miles < 120 || avoidTolls) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ctrl.abort(), 16000);
    try {
      const truck = await fetchBrouterRoute(from, to, profile, ctrl.signal, avoidTolls);
      if (truck) return truck;
    } catch {
      /* OSRM fallback */
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  const osrm = await fetchDrivingRoute(from, to, signal);
  if (osrm) {
    return {
      ...osrm,
      id: `truck-${to.id}`,
      highways: osrm.highways,
      restrictions: avoidTolls
        ? [...osrm.restrictions, { atMi: 0, type: "weight", label: "Toll-free routing unavailable on this stretch" }]
        : osrm.restrictions,
    };
  }
  try {
    return await fetchBrouterRoute(from, to, profile, signal, avoidTolls);
  } catch {
    return null;
  }
}
