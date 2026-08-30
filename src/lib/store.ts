import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ConvoyTruck,
  Facility,
  GpsFix,
  GpsStatus,
  HosState,
  Layers,
  NavState,
  Overlay,
  Place,
  Report,
  ReportKind,
  Route,
  TravelMode,
  TruckProfile,
} from "./types";
import {
  FACILITIES,
  ORIGIN,
  ORIGIN_CITY,
  ORIGIN_LABEL,
  PLACES,
  POSTED_LIMIT,
  REPORT_META,
  ROUTE_BY_DEST,
  SEED_REPORTS,
  placeById,
  routeById as cannedRouteById,
  facilityById,
} from "./data";
import { distToPath, haversine, offset, pointAlong, snapToPath, trafficAt } from "./geo";
import { formatMi } from "./format";
import { fetchNavRoute } from "./routing";
import { resetVoice, speak } from "./voice";

const DEFAULT_PROFILE: TruckProfile = {
  class: "semi",
  heightFt: 13.5,
  weightLbs: 80000,
  lengthFt: 73,
  axles: 5,
  hazmat: false,
};

const DEFAULT_LAYERS: Layers = {
  stops: true,
  rest: true,
  scales: true,
  reports: true,
  traffic: true,
  convoy: false,
};

const DEFAULT_HOS: HosState = {
  driveSec: 8 * 3600 + 12 * 60,
  breakInSec: 2 * 3600 + 40 * 60,
  dutySec: 10 * 3600 + 5 * 60,
  cycleSec: 42 * 3600,
};

const DEFAULT_NAV: NavState = {
  active: false,
  preview: false,
  destId: null,
  routeId: null,
  traveledMi: 0,
  speedMph: 0,
  follow: true,
  arrived: false,
};

const HOME_LABEL = `${ORIGIN_LABEL} · ${ORIGIN_CITY}`;

let convoyClock = 0;
let lastRerouteAt = 0;

function seedConvoy(origin = ORIGIN): ConvoyTruck[] {
  const hubs = [
    origin,
    offset(origin, 5, 2),
    offset(origin, 4, -22),
    offset(origin, -20, -4),
    offset(origin, -10, 9),
  ];
  return Array.from({ length: 14 }, (_, i) => {
    const hub = hubs[i % hubs.length]!;
    const ang = (i * 47) % 360;
    const rad = 0.04 + (i % 5) * 0.02;
    return {
      id: `cv-${i}`,
      coord: {
        lat: hub.lat + Math.cos((ang * Math.PI) / 180) * rad,
        lng: hub.lng + Math.sin((ang * Math.PI) / 180) * rad * 1.15,
      },
      heading: (ang + 90) % 360,
      speedMph: 58 + (i % 7) * 2,
    };
  });
}

function scaleOpen(id: string, now = Date.now()): boolean {
  const hour = new Date(now).getHours();
  return (hour + id.length) % 3 !== 0;
}

function lookupRoute(id: string | null, extra: Record<string, Route>): Route | undefined {
  if (!id) return undefined;
  return extra[id] ?? cannedRouteById(id);
}

type AppState = {
  profile: TruckProfile;
  layers: Layers;
  voiceOn: boolean;
  nightMap: boolean;
  avoidTolls: boolean;
  travelMode: TravelMode;
  satellite: boolean;
  overlay: Overlay;
  seenOnboard: boolean;
  extraReports: Report[];
  extraPlaces: Place[];
  extraRoutes: Record<string, Route>;
  extraFacilities: Facility[];
  origin: { lat: number; lng: number };
  originLabel: string;
  gps: GpsFix | null;
  gpsStatus: GpsStatus;
  hos: HosState;
  nav: NavState;
  convoy: ConvoyTruck[];
  selectedFacilityId: string | null;
  alert: string | null;
  alertKey: string | null;
  setProfile: (p: Partial<TruckProfile>) => void;
  setLayers: (l: Partial<Layers>) => void;
  setVoice: (on: boolean) => void;
  setNightMap: (on: boolean) => void;
  setAvoidTolls: (on: boolean) => void;
  setTravelMode: (mode: TravelMode) => void;
  setSatellite: (on: boolean) => void;
  setOverlay: (o: Overlay) => void;
  completeOnboard: () => void;
  setFollow: (on: boolean) => void;
  previewDestination: (placeId: string) => void;
  goToPlace: (place: Place) => void;
  relocate: (coord: { lat: number; lng: number }, label: string) => void;
  applyGpsFix: (fix: GpsFix) => void;
  setGpsStatus: (s: GpsStatus) => void;
  setOriginLabel: (label: string) => void;
  setExtraFacilities: (list: Facility[]) => void;
  startNav: () => void;
  stopNav: () => void;
  tick: (dtSec: number) => void;
  addReport: (kind: ReportKind) => void;
  voteReport: (id: string) => void;
  selectFacility: (id: string | null) => void;
  takeBreak: () => void;
  resetHos: () => void;
  clearAlert: () => void;
};

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      layers: DEFAULT_LAYERS,
      voiceOn: true,
      nightMap: false,
      avoidTolls: false,
      travelMode: "truck",
      satellite: false,
      overlay: "none",
      seenOnboard: false,
      extraReports: [],
      extraPlaces: [],
      extraRoutes: {},
      extraFacilities: [],
      origin: ORIGIN,
      originLabel: HOME_LABEL,
      gps: null,
      gpsStatus: "off",
      hos: { ...DEFAULT_HOS },
      nav: { ...DEFAULT_NAV },
      convoy: seedConvoy(ORIGIN),
      selectedFacilityId: null,
      alert: null,
      alertKey: null,

      setProfile: (p) => set({ profile: { ...get().profile, ...p } }),
      setLayers: (l) => set({ layers: { ...get().layers, ...l } }),
      setVoice: (on) => {
        if (!on) resetVoice();
        set({ voiceOn: on });
      },
      setNightMap: (on) => set({ nightMap: on }),
      setAvoidTolls: (on) => set({ avoidTolls: on }),
      setTravelMode: (mode) => {
        if (get().travelMode === mode) return;
        set({ travelMode: mode });
        const dest = resolvePlace(get().nav.destId);
        if (dest && (get().nav.preview || get().nav.active)) {
          get().goToPlace(dest);
        }
      },
      setSatellite: (on) => set({ satellite: on }),
      setOverlay: (o) => set({ overlay: o }),
      completeOnboard: () => set({ seenOnboard: true, overlay: "none" }),
      setFollow: (on) => set({ nav: { ...get().nav, follow: on } }),

      relocate: (coord, label) => {
        resetVoice();
        set({
          origin: coord,
          originLabel: label,
          convoy: seedConvoy(coord),
          nav: { ...DEFAULT_NAV, follow: true },
          selectedFacilityId: null,
        });
      },

      applyGpsFix: (fix) => {
        const s = get();
        const jumped = haversine(s.origin, fix.coord) > 25;
        const heading = fix.speedMph > 1.5 && fix.heading >= 0 ? fix.heading : (s.gps?.heading ?? fix.heading);
        const gps = { ...fix, heading };
        let nav = s.nav;
        let extraRoutes = s.extraRoutes;
        let alert = s.alert;
        let alertKey = s.alertKey;

        if (nav.active && nav.routeId) {
          const route = lookupRoute(nav.routeId, extraRoutes);
          if (route) {
            const snap = snapToPath(fix.coord, route.polyline);
            if (snap.distMi <= 0.4) {
              const traveledMi = snap.traveledMi;
              if (traveledMi >= route.distanceMi - 0.1) {
                speak("You have arrived.", s.voiceOn);
                nav = { ...nav, active: false, arrived: true, traveledMi: route.distanceMi, speedMph: 0, follow: true };
                alert = "Arrived. Nearby truck parking is pinned on the map.";
                alertKey = "arrived";
              } else {
                nav = { ...nav, traveledMi, speedMph: fix.speedMph, follow: nav.follow };
              }
            } else {
              nav = { ...nav, speedMph: fix.speedMph };
              const dest = s.extraPlaces.find((p) => p.id === nav.destId) ?? placeById(nav.destId ?? "");
              if (dest && Date.now() - lastRerouteAt > 14000) {
                lastRerouteAt = Date.now();
                void fetchNavRoute(fix.coord, dest, s.profile, s.avoidTolls, s.travelMode).then((route) => {
                  if (!route) return;
                  const cur = get();
                  if (!cur.nav.active || cur.nav.destId !== dest.id) return;
                  resetVoice();
                  set({
                    extraRoutes: { ...cur.extraRoutes, [route.id]: route },
                    nav: { ...cur.nav, routeId: route.id, traveledMi: 0, speedMph: cur.gps?.speedMph ?? 0 },
                    alert: "Rerouting.",
                    alertKey: `re-${route.id}`,
                  });
                  speak("Rerouting.", cur.voiceOn);
                });
              }
            }
          }
        } else if (!nav.active) {
          nav = { ...nav, speedMph: fix.speedMph };
        }

        set({
          gps,
          gpsStatus: "live",
          origin: fix.coord,
          convoy: jumped ? seedConvoy(fix.coord) : s.convoy,
          nav,
          extraRoutes,
          alert,
          alertKey,
          seenOnboard: true,
          overlay: s.overlay === "onboard" ? "none" : s.overlay,
        });
      },

      setGpsStatus: (gpsStatus) => set({ gpsStatus }),
      setOriginLabel: (originLabel) => set({ originLabel }),
      setExtraFacilities: (extraFacilities) => set({ extraFacilities }),

      previewDestination: (placeId) => {
        const routeId = ROUTE_BY_DEST[placeId];
        if (!routeId) return;
        resetVoice();
        set({
          overlay: "none",
          selectedFacilityId: null,
          alert: null,
          alertKey: null,
          nav: {
            ...DEFAULT_NAV,
            preview: true,
            destId: placeId,
            routeId,
            follow: false,
            speedMph: 0,
          },
        });
      },

      goToPlace: (place) => {
        const origin = get().gps?.coord ?? get().origin;
        const extraPlaces = [place, ...get().extraPlaces.filter((p) => p.id !== place.id)].slice(0, 40);
        const mode = get().travelMode;
        const word = mode === "walk" ? "walking route" : `${mode} route`;
        set({
          extraPlaces,
          overlay: "none",
          alert: `Plotting a ${word} to ${place.name}…`,
          alertKey: `plot-${place.id}`,
        });
        void fetchNavRoute(origin, place, get().profile, get().avoidTolls, mode)
          .then((route) => {
            if (!route) throw new Error("no route");
            resetVoice();
            set({
              extraRoutes: { ...get().extraRoutes, [route.id]: route },
              extraPlaces,
              alert: null,
              alertKey: null,
              selectedFacilityId: null,
              nav: {
                ...DEFAULT_NAV,
                preview: true,
                destId: place.id,
                routeId: route.id,
                follow: false,
                speedMph: 0,
              },
            });
          })
          .catch(() => {
            get().relocate(place.coord, place.name);
            set({
              overlay: "none",
              extraPlaces,
              alert: `No ${word} from here. Map is now on ${place.name}.`,
              alertKey: `reloc-${place.id}`,
            });
          });
      },

      startNav: () => {
        const { nav, voiceOn, extraRoutes, gps } = get();
        if (!nav.routeId) return;
        const route = lookupRoute(nav.routeId, extraRoutes);
        if (!route) return;
        resetVoice();
        const first = route.instructions[0];
        const snap = gps ? snapToPath(gps.coord, route.polyline) : null;
        set({
          overlay: "none",
          nav: {
            ...nav,
            active: true,
            preview: false,
            traveledMi: snap && snap.distMi < 0.5 ? snap.traveledMi : 0,
            speedMph: gps?.speedMph ?? 0,
            follow: true,
            arrived: false,
          },
        });
        if (first) speak(`${first.primary}. ${first.secondary}.`, voiceOn);
      },

      stopNav: () => {
        resetVoice();
        set({
          nav: { ...DEFAULT_NAV },
          alert: null,
          alertKey: null,
        });
      },

      tick: (dtSec) => {
        const { nav, hos, convoy, voiceOn, layers, profile, extraRoutes, gps } = get();
        convoyClock += dtSec;
        const pulseConvoy = convoyClock >= 0.2;
        if (pulseConvoy) convoyClock = 0;
        const nextConvoy =
          layers.convoy && pulseConvoy
            ? convoy.map((t, i) => {
                const step = (t.speedMph / 3600) * Math.max(dtSec, 0.2);
                const rad = (t.heading * Math.PI) / 180;
                const dLat = (step / 69) * Math.cos(rad);
                const dLng =
                  (step / (69 * Math.cos((t.coord.lat * Math.PI) / 180))) * Math.sin(rad);
                let heading = t.heading + Math.sin(Date.now() / 4000 + i) * 0.8;
                heading = (heading + 360) % 360;
                return {
                  ...t,
                  heading,
                  coord: { lat: t.coord.lat + dLat, lng: t.coord.lng + dLng },
                };
              })
            : convoy;

        const gpsLive = Boolean(gps && Date.now() - gps.at < 8000);
        const driving = gpsLive ? (gps?.speedMph ?? 0) > 4 : nav.active;

        if (!nav.active && !driving) {
          if (pulseConvoy && layers.convoy) set({ convoy: nextConvoy });
          return;
        }
        const route = nav.routeId ? lookupRoute(nav.routeId, extraRoutes) : undefined;
        if (nav.active && !route) return;

        let speedMph = nav.speedMph;
        let traveledMi = nav.traveledMi;
        if (gpsLive) {
          speedMph = gps?.speedMph ?? 0;
        } else if (nav.active && route) {
          const level = trafficAt(route.traffic, nav.traveledMi);
          const target =
            level === "heavy" ? 34 : level === "moderate" ? 52 : level === "light" ? 60 : 66;
          speedMph = nav.speedMph + (target - nav.speedMph) * 0.12;
          traveledMi = nav.traveledMi + (speedMph / 3600) * dtSec;
        }

        const nextHos: HosState = driving
          ? {
              driveSec: Math.max(0, hos.driveSec - dtSec),
              breakInSec: Math.max(0, hos.breakInSec - dtSec),
              dutySec: Math.max(0, hos.dutySec - dtSec),
              cycleSec: Math.max(0, hos.cycleSec - dtSec),
            }
          : hos;

        if (nav.active && route && !gpsLive && traveledMi >= route.distanceMi - 0.08) {
          speak("You have arrived.", voiceOn);
          set({
            convoy: nextConvoy,
            hos: nextHos,
            nav: { ...nav, active: false, arrived: true, traveledMi: route.distanceMi, speedMph: 0, follow: true },
            alert: "Arrived. Nearby truck parking is pinned on the map.",
            alertKey: "arrived",
          });
          return;
        }

        let alert = get().alert;
        let alertKey = get().alertKey;
        const pushAlert = (key: string, text: string, voice?: string) => {
          if (alertKey === key) return;
          alert = text;
          alertKey = key;
          if (voice) speak(voice, voiceOn);
        };

        for (const r of route?.restrictions ?? []) {
          const ahead = r.atMi - traveledMi;
          if (ahead > 0.15 && ahead < 3.2) {
            if (r.type === "weigh_open") {
              pushAlert(`rst-${r.atMi}`, `Weigh station in ${formatMi(ahead)}`, "Weigh station ahead.");
            } else if (r.type === "low_bridge" && r.avoided) {
              pushAlert(`rst-${r.atMi}`, r.label);
            } else if (r.type === "grade") {
              pushAlert(`rst-${r.atMi}`, r.label, "Steep grade ahead. Check your speed.");
            } else if (r.type === "weight") {
              pushAlert(`rst-${r.atMi}`, r.label);
            } else if (r.type === "hazmat" && profile.hazmat) {
              pushAlert(`rst-${r.atMi}`, r.label);
            }
          }
        }

        if (nextHos.breakInSec <= 0 && hos.breakInSec > 0) {
          pushAlert("hos-break", "30-minute break required. Find a truck stop.", "Break required. Find a safe place to park.");
        } else if (nextHos.driveSec < 20 * 60 && nextHos.driveSec > 0) {
          pushAlert("hos-drive", `Drive time remaining ${Math.round(nextHos.driveSec / 60)} min.`);
        }

        const reports = getReports();
        if (layers.reports && route) {
          for (const rp of reports) {
            const d = haversine(pointAlong(route.polyline, traveledMi).pos, rp.coord);
            if (d < 2.4) {
              const meta = REPORT_META[rp.kind];
              pushAlert(`rep-${rp.id}`, `${meta.label} · ${rp.highway} · ${rp.note}`, `${meta.label} ahead.`);
            }
          }
        }

        if (route) {
          const ins = currentInstruction(route, traveledMi);
          const nextIns = nextInstruction(route, traveledMi);
          if (nextIns) {
            const d = nextIns.atMi - traveledMi;
            if (d < 1.6 && d > 0.2) {
              speak(`${nextIns.primary}. ${nextIns.secondary}.`, voiceOn);
            }
          } else if (ins && traveledMi > 0.4) {
            const remain = route.distanceMi - traveledMi;
            if (remain < 1.2) speak("Approaching destination.", voiceOn);
          }
        }

        set({
          convoy: nextConvoy,
          hos: nextHos,
          alert,
          alertKey,
          nav: { ...nav, traveledMi, speedMph },
        });
      },

      addReport: (kind) => {
        const pos = getPosition();
        const report: Report = {
          id: `u-${Date.now()}`,
          kind,
          coord: offset(pos.coord, 0.02, 0.01),
          note: "Reported by you",
          votes: 1,
          createdAt: Date.now(),
          highway: pos.highway,
        };
        set({
          extraReports: [report, ...get().extraReports].slice(0, 40),
          overlay: "none",
          alert: `${REPORT_META[kind].label} posted. Other drivers will see it.`,
          alertKey: `new-${report.id}`,
        });
        speak("Report sent. Thanks.", get().voiceOn);
      },

      voteReport: (id) => {
        set({
          extraReports: get().extraReports.map((r) =>
            r.id === id ? { ...r, votes: r.votes + 1 } : r,
          ),
        });
      },

      selectFacility: (id) =>
        set({
          selectedFacilityId: id,
          overlay: id ? "facility" : "none",
        }),

      takeBreak: () =>
        set({
          hos: { ...get().hos, breakInSec: 8 * 3600 },
          alert: "Break logged. 8-hour window until the next rest.",
          alertKey: "break",
        }),

      resetHos: () =>
        set({
          hos: { ...DEFAULT_HOS },
          alert: "HOS clocks reset to a fresh day.",
          alertKey: "hos-reset",
        }),

      clearAlert: () => set({ alert: null, alertKey: null }),
    }),
    {
      name: "rigradar-v1",
      partialize: (s) => ({
        profile: s.profile,
        layers: s.layers,
        voiceOn: s.voiceOn,
        avoidTolls: s.avoidTolls,
        travelMode: s.travelMode,
        satellite: s.satellite,
        seenOnboard: s.seenOnboard,
        extraReports: s.extraReports,
        extraFacilities: s.extraFacilities,
        hos: s.hos,
        origin: s.origin,
        originLabel: s.originLabel,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          seenOnboard: Boolean(current.seenOnboard || p.seenOnboard),
          layers: { ...DEFAULT_LAYERS, ...(p.layers ?? {}), convoy: false },
          avoidTolls: Boolean(p.avoidTolls),
          travelMode: p.travelMode === "car" || p.travelMode === "bus" || p.travelMode === "walk" ? p.travelMode : "truck",
          satellite: Boolean(p.satellite),
        };
      },
    },
  ),
);

export function getReports(): Report[] {
  const extra = useApp.getState().extraReports;
  return [...extra, ...SEED_REPORTS];
}

export function currentInstruction(route: Route, traveledMi: number) {
  let cur = route.instructions[0] ?? null;
  for (const ins of route.instructions) {
    if (ins.atMi <= traveledMi + 0.05) cur = ins;
  }
  return cur;
}

export function nextInstruction(route: Route, traveledMi: number) {
  return route.instructions.find((ins) => ins.atMi > traveledMi + 0.15) ?? null;
}

export function resolveRoute(id: string | null): Route | undefined {
  return lookupRoute(id, useApp.getState().extraRoutes);
}

export function resolvePlace(id: string | null): Place | undefined {
  if (!id) return undefined;
  return useApp.getState().extraPlaces.find((p) => p.id === id) ?? placeById(id);
}

export function resolveFacility(id: string | null): Facility | undefined {
  if (!id) return undefined;
  return useApp.getState().extraFacilities.find((f) => f.id === id) ?? facilityById(id);
}

export function getPosition(): { coord: ReturnType<typeof pointAlong>["pos"]; heading: number; highway: string } {
  const { nav, origin, extraRoutes, originLabel, gps } = useApp.getState();
  if (gps && Date.now() - gps.at < 15000) {
    return { coord: gps.coord, heading: gps.heading >= 0 ? gps.heading : 0, highway: originLabel };
  }
  if (nav.routeId) {
    const route = lookupRoute(nav.routeId, extraRoutes);
    if (route) {
      const p = pointAlong(route.polyline, nav.traveledMi);
      const ins = currentInstruction(route, nav.traveledMi);
      return { coord: p.pos, heading: p.heading, highway: ins?.secondary.split("·")[0]?.trim() ?? route.highways[0] ?? "Local" };
    }
  }
  return { coord: origin, heading: 175, highway: originLabel };
}

export function remainingMin(route: Route, traveledMi: number, speedMph: number): number {
  const left = Math.max(0, route.distanceMi - traveledMi);
  const mph = Math.max(28, speedMph || 58);
  return (left / mph) * 60;
}

export function allFacilities(): Facility[] {
  const extra = useApp.getState().extraFacilities;
  if (extra.length === 0) return FACILITIES;
  const ids = new Set(extra.map((f) => f.id));
  return [...extra, ...FACILITIES.filter((f) => !ids.has(f.id))];
}

export function nearbyFacilities(coord: { lat: number; lng: number }, limit = 8): (Facility & { distanceMi: number })[] {
  return allFacilities()
    .map((f) => ({ ...f, distanceMi: haversine(coord, f.coord) }))
    .filter((f) => f.distanceMi < 40)
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, limit);
}

export function reportsOnRoute(route: Route): Report[] {
  return getReports().filter((r) => distToPath(r.coord, route.polyline) < 2.8);
}

export function cheapestDieselNear(coord: { lat: number; lng: number }) {
  const withFuel = allFacilities()
    .filter((f) => f.diesel != null)
    .map((f) => ({
      ...f,
      distanceMi: haversine(coord, f.coord),
    }))
    .filter((f) => f.distanceMi < 80);
  withFuel.sort((a, b) => (a.diesel ?? 99) - (b.diesel ?? 99));
  return withFuel[0] ?? null;
}

export function searchPlaces(q: string): Place[] {
  const origin = useApp.getState().origin;
  const local = PLACES.filter((p) => haversine(origin, p.coord) < 250);
  const s = q.trim().toLowerCase();
  if (!s) return local;
  return local.filter(
    (p) =>
      p.name.toLowerCase().includes(s) ||
      p.subtitle.toLowerCase().includes(s) ||
      p.kind.includes(s),
  );
}

export function searchFacilities(q: string): Facility[] {
  const origin = useApp.getState().origin;
  const local = allFacilities().filter((f) => haversine(origin, f.coord) < 40);
  const s = q.trim().toLowerCase();
  if (!s) return local;
  return local.filter(
    (f) =>
      f.name.toLowerCase().includes(s) ||
      f.subtitle.toLowerCase().includes(s) ||
      f.type.replace("_", " ").includes(s),
  );
}

export function isScaleOpen(id: string): boolean {
  return scaleOpen(id);
}

export { POSTED_LIMIT, PLACES, FACILITIES, ROUTE_BY_DEST };
