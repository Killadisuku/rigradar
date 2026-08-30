import type { LatLng, TrafficLevel, TrafficZone } from "./types";

const EARTH_MI = 3958.8;

export function haversine(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function heading(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function densify(points: LatLng[], maxSegMi = 1.15): LatLng[] {
  if (points.length === 0) return [];
  const out: LatLng[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const d = haversine(a, b);
    const n = Math.max(1, Math.ceil(d / maxSegMi));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

export function pathLength(points: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1]!, points[i]!);
  return d;
}

export type PathIndex = { pos: LatLng; heading: number; next: LatLng };

export function pointAlong(points: LatLng[], traveledMi: number): PathIndex {
  if (points.length === 1) {
    return { pos: points[0]!, heading: 0, next: points[0]! };
  }
  let remaining = Math.max(0, traveledMi);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const seg = haversine(a, b);
    if (remaining <= seg || i === points.length - 2) {
      const t = seg === 0 ? 0 : Math.min(1, remaining / seg);
      return {
        pos: {
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t,
        },
        heading: heading(a, b),
        next: b,
      };
    }
    remaining -= seg;
  }
  const last = points[points.length - 1]!;
  const prev = points[points.length - 2] ?? last;
  return { pos: last, heading: heading(prev, last), next: last };
}

export function snapToPath(point: LatLng, points: LatLng[]): {
  traveledMi: number;
  distMi: number;
  heading: number;
  pos: LatLng;
} {
  if (points.length === 0) {
    return { traveledMi: 0, distMi: Infinity, heading: 0, pos: point };
  }
  if (points.length === 1) {
    return { traveledMi: 0, distMi: haversine(point, points[0]!), heading: 0, pos: points[0]! };
  }
  let best = { traveledMi: 0, distMi: Infinity, heading: 0, pos: points[0]! };
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const seg = haversine(a, b);
    const t = clamp01(projectT(point, a, b));
    const pos = lerpLngLat(a, b, t);
    const d = haversine(point, pos);
    if (d < best.distMi) {
      best = { traveledMi: acc + t * seg, distMi: d, heading: heading(a, b), pos };
    }
    acc += seg;
  }
  return best;
}

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

function projectT(p: LatLng, a: LatLng, b: LatLng) {
  const x = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  const y = b.lat - a.lat;
  const len2 = x * x + y * y;
  if (len2 < 1e-18) return 0;
  const px = (p.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  const py = p.lat - a.lat;
  return (px * x + py * y) / len2;
}

export function distToPath(point: LatLng, points: LatLng[]): number {
  return snapToPath(point, points).distMi;
}

export function trafficAt(zones: TrafficZone[], traveledMi: number): TrafficLevel {
  for (const z of zones) {
    if (traveledMi >= z.fromMi && traveledMi < z.toMi) return z.level;
  }
  return "clear";
}

export function lerpLngLat(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

export function offset(coord: LatLng, northMi: number, eastMi: number): LatLng {
  const dLat = northMi / 69.0;
  const dLng = eastMi / (Math.cos((coord.lat * Math.PI) / 180) * 69.0);
  return { lat: coord.lat + dLat, lng: coord.lng + dLng };
}

export function slicePath(points: LatLng[], fromMi: number, toMi: number): LatLng[] {
  if (points.length < 2) return points;
  const start = pointAlong(points, fromMi).pos;
  const end = pointAlong(points, toMi).pos;
  const out: LatLng[] = [start];
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const seg = haversine(a, b);
    const next = acc + seg;
    if (next > fromMi && acc < toMi) {
      if (acc > fromMi) out.push(a);
    }
    acc = next;
    if (acc >= toMi) break;
  }
  out.push(end);
  return out;
}

