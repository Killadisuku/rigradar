import type { LatLng, Report, TrafficFlow, TrafficLevel, TrafficZone } from "./types";
import { haversine } from "./geo";

const OVERPASS = "https://maps.mail.ru/osm/tools/overpass/api/interpreter";
const ARABIC = /[\u0600-\u06FF]/;

export const TRAFFIC_LABEL: Record<TrafficLevel, string> = {
  clear: "Roads moving",
  light: "Light traffic",
  moderate: "Moderate traffic",
  heavy: "Heavy traffic",
};

export const TRAFFIC_COLOR: Record<TrafficLevel, string> = {
  clear: "#3ecfbe",
  light: "#7dcf8a",
  moderate: "#e0a247",
  heavy: "#e05656",
};

export function levelFromMph(mph: number, posted = 55): TrafficLevel {
  if (!Number.isFinite(mph) || mph <= 0) return "moderate";
  const ratio = mph / Math.max(12, posted);
  if (ratio < 0.32) return "heavy";
  if (ratio < 0.52) return "moderate";
  if (ratio < 0.78) return "light";
  return "clear";
}

export function zonesFromSteps(
  steps: { distance: number; duration: number }[],
  distanceUnit: "mi" | "m",
): TrafficZone[] {
  const zones: TrafficZone[] = [];
  let acc = 0;
  for (const step of steps) {
    const distanceMi = distanceUnit === "mi" ? Number(step.distance) : Number(step.distance) / 1609.34;
    const sec = Number(step.duration);
    if (!Number.isFinite(distanceMi) || distanceMi < 0.04) {
      acc += Math.max(0, distanceMi);
      continue;
    }
    const mph = sec > 0 ? distanceMi / (sec / 3600) : 55;
    if (mph < 7) {
      acc += distanceMi;
      continue;
    }
    const posted = distanceMi > 1.2 ? 65 : 45;
    const level = levelFromMph(mph, posted);
    const fromMi = acc;
    const toMi = acc + distanceMi;
    const last = zones[zones.length - 1];
    if (last && last.level === level && fromMi - last.toMi < 0.08) last.toMi = toMi;
    else zones.push({ fromMi, toMi, level });
    acc = toMi;
  }
  return zones.filter((z) => z.toMi - z.fromMi >= 0.12);
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function peakFactor(at = new Date()): number {
  const h = at.getHours() + at.getMinutes() / 60;
  const day = at.getDay();
  // GCC work week: Friday–Saturday weekend. Sunday is a workday.
  const weekend = day === 5 || day === 6;
  let peak = 0.18;
  if (h >= 6.8 && h <= 9.6) peak = 1;
  else if (h >= 12.2 && h <= 15.2) peak = 0.55;
  else if (h >= 16.3 && h <= 20.4) peak = 0.95;
  else if (h >= 20.4 && h <= 22.5) peak = 0.38;
  if (weekend) peak *= 0.55;
  return peak;
}

function classWeight(highway: string): number {
  if (highway === "motorway" || highway === "motorway_link") return 1;
  if (highway === "trunk" || highway === "trunk_link") return 0.9;
  if (highway === "primary") return 0.72;
  if (highway === "secondary") return 0.48;
  return 0.3;
}

export function levelForRoad(id: string, highway: string, at = new Date()): TrafficLevel {
  const jitter = (hash32(`${id}:${at.getHours()}`) % 100) / 100;
  const score = peakFactor(at) * classWeight(highway) * 0.78 + jitter * 0.34;
  if (score > 0.74) return "heavy";
  if (score > 0.5) return "moderate";
  if (score > 0.3) return "light";
  return "clear";
}

export function summarizeLevel(flows: TrafficFlow[], routeZones: TrafficZone[] = []): TrafficLevel {
  const score: Record<TrafficLevel, number> = { clear: 0, light: 1, moderate: 2, heavy: 3 };
  const bits = [
    ...flows.map((f) => score[f.level]),
    ...routeZones.map((z) => score[z.level]),
  ];
  if (!bits.length) return "clear";
  const avg = bits.reduce((a, b) => a + b, 0) / bits.length;
  if (avg >= 2.15) return "heavy";
  if (avg >= 1.25) return "moderate";
  if (avg >= 0.45) return "light";
  return "clear";
}

export function delayMinutes(distanceMi: number, durationMin: number): number {
  const free = (distanceMi / 52) * 60;
  return Math.max(0, Math.round(durationMin - free));
}

function englishWayName(tags: Record<string, string> | undefined): string {
  const t = tags ?? {};
  const preferred = t["name:en"] || t.name_en || t["name:latin"] || t.int_name || t.ref;
  if (preferred) return preferred;
  const raw = t.name || t.highway || "Road";
  if (ARABIC.test(raw)) return t.ref || t.highway || "Road";
  return raw;
}

type OsmWay = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

export async function fetchAreaTraffic(at: LatLng, reports: Report[] = [], signal?: AbortSignal): Promise<TrafficFlow[]> {
  const q = `[out:json][timeout:14];
way["highway"~"^(motorway|trunk|primary)$"](around:7000,${at.lat},${at.lng});
out geom 40;`;
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "text/plain", Accept: "application/json" },
    body: q,
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { elements?: OsmWay[] };
  const out: TrafficFlow[] = [];
  const now = new Date();
  for (const el of data.elements ?? []) {
    const geom = el.geometry ?? [];
    if (geom.length < 4) continue;
    const polyline: LatLng[] = [];
    const step = geom.length > 48 ? Math.ceil(geom.length / 40) : 1;
    for (let i = 0; i < geom.length; i += step) {
      const n = geom[i]!;
      polyline.push({ lat: n.lat, lng: n.lon });
    }
    const last = geom[geom.length - 1]!;
    const tail = polyline[polyline.length - 1];
    if (!tail || tail.lat !== last.lat) polyline.push({ lat: last.lat, lng: last.lon });
    if (haversine(polyline[0]!, polyline[polyline.length - 1]!) < 0.08 && polyline.length < 6) continue;
    const highway = el.tags?.highway ?? "primary";
    let level = levelForRoad(String(el.id), highway, now);
    for (const r of reports) {
      if (haversine(r.coord, polyline[Math.floor(polyline.length / 2)]!) < 0.35) {
        level = r.kind === "closed" || r.kind === "crash" ? "heavy" : level === "clear" ? "moderate" : "heavy";
        break;
      }
    }
    out.push({
      id: `tf-${el.id}`,
      level,
      name: englishWayName(el.tags),
      polyline,
      highway,
    });
    if (out.length >= 40) break;
  }
  return out;
}
