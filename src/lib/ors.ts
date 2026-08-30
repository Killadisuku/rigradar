import { createServerFn } from "@tanstack/react-start";
import { densify, pathLength } from "./geo";
import type { Instruction, LatLng, Restriction, Route } from "./types";

type OrsStep = {
  distance?: number;
  duration?: number;
  type?: number;
  instruction?: string;
  name?: string;
};

type OrsFeature = {
  geometry?: { coordinates?: [number, number][] };
  properties?: {
    summary?: { distance?: number; duration?: number };
    segments?: { steps?: OrsStep[] }[];
  };
};

const ARABIC = /[\u0600-\u06FF]/;

function englishLine(instruction: string, name: string): { primary: string; secondary: string } {
  let primary = instruction.replace(/\s+(on|onto)\s+.*/i, "").trim() || "Continue";
  if (ARABIC.test(primary)) primary = "Continue";
  let secondary = name && name !== "-" ? name : "truck route";
  if (ARABIC.test(secondary)) secondary = "local road";
  return { primary, secondary };
}

function toRoute(
  feat: OrsFeature,
  to: { id: string; name: string },
  avoidedTolls: boolean,
  wantedTolls: boolean,
): Route | null {
  const coords = feat.geometry?.coordinates;
  if (!coords?.length) return null;
  const polyline = densify(
    coords.map(([lng, lat]) => ({ lat, lng })),
    0.9,
  );
  const summary = feat.properties?.summary;
  const distanceMi = pathLength(polyline) || Number(summary?.distance ?? 0);
  const durationMin = Math.max(1, Math.round(Number(summary?.duration ?? 0) / 60) || Math.round((distanceMi / 52) * 60));
  const steps = feat.properties?.segments?.[0]?.steps ?? [];
  const instructions: Instruction[] = [];
  const highways: string[] = [];
  let acc = 0;
  for (const step of steps) {
    const line = englishLine(step.instruction ?? "Continue", step.name ?? "");
    if (step.type !== 10 || instructions.length === 0) {
      instructions.push({ atMi: acc, primary: line.primary, secondary: line.secondary });
    }
    const ref = (step.name ?? "").match(/\b([A-Z]{1,3}\s?\d+[A-Z]?)\b/);
    if (ref && !highways.includes(ref[1]!)) highways.push(ref[1]!);
    acc += Number(step.distance ?? 0);
  }
  if (!instructions.length) {
    instructions.push({ atMi: 0, primary: "Head out on truck route", secondary: to.name });
  }
  if (instructions[instructions.length - 1]?.primary !== "Arrive at your destination") {
    instructions.push({ atMi: Math.max(0, distanceMi - 0.2), primary: "Arrive", secondary: to.name });
  }
  const restrictions: Restriction[] = [];
  if (wantedTolls && !avoidedTolls) {
    restrictions.push({ atMi: 0, type: "weight", label: "No toll-free truck route — using the HGV highway" });
  }
  return {
    id: `ors-${to.id}`,
    fromId: "origin",
    toId: to.id,
    polyline,
    distanceMi,
    durationMin,
    highways: highways.length ? highways : ["HGV route"],
    restrictions,
    traffic: [],
    instructions,
  };
}

async function orsGeojson(
  key: string,
  from: LatLng,
  to: LatLng,
  restrictions: { height: number; width: number; length: number; weight: number; hazmat: boolean },
  avoidTolls: boolean,
): Promise<OrsFeature | null> {
  const avoid = ["ferries"];
  if (avoidTolls) avoid.push("tollways");
  const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-hgv/geojson", {
    method: "POST",
    headers: {
      Authorization: key,
      "Content-Type": "application/json",
      Accept: "application/geo+json",
    },
    body: JSON.stringify({
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
      units: "mi",
      language: "en",
      instructions: true,
      geometry: true,
      options: {
        avoid_features: avoid,
        vehicle_type: "hgv",
        profile_params: { restrictions },
      },
    }),
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: OrsFeature[] };
  return data.features?.[0] ?? null;
}

export const plotOrsRoute = createServerFn({ method: "POST" })
  .validator(
    (d: {
      from: LatLng;
      to: { id: string; name: string; lat: number; lng: number };
      heightFt: number;
      weightLbs: number;
      lengthFt: number;
      hazmat: boolean;
      avoidTolls: boolean;
    }) => d,
  )
  .handler(async ({ data }): Promise<Route | null> => {
    let key = process.env["ORS_API_KEY"]?.trim() ?? "";
    if (!key) {
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const p = path.resolve(process.cwd(), ".env");
        if (fs.existsSync(p)) {
          const line = fs
            .readFileSync(p, "utf8")
            .split(/\r?\n/)
            .find((l) => l.startsWith("ORS_API_KEY="));
          key = line ? line.slice("ORS_API_KEY=".length).trim().replace(/^["']|["']$/g, "") : "";
        }
      } catch {
        key = "";
      }
    }
    if (!key) return null;
    const restrictions = {
      height: data.heightFt * 0.3048,
      width: 2.6,
      length: data.lengthFt * 0.3048,
      weight: data.weightLbs / 2204.62,
      hazmat: data.hazmat,
    };
    const dest = { lat: data.to.lat, lng: data.to.lng };
    let feat = await orsGeojson(key, data.from, dest, restrictions, data.avoidTolls);
    let usedTollsAvoid = data.avoidTolls;
    if (!feat && data.avoidTolls) {
      feat = await orsGeojson(key, data.from, dest, restrictions, false);
      usedTollsAvoid = false;
    }
    if (!feat) return null;
    return toRoute(feat, data.to, usedTollsAvoid, data.avoidTolls);
  });
