import { useEffect, useRef } from "react";
import type { Circle, LayerGroup, Map as LeafletMap, Marker, Polyline, TileLayer } from "leaflet";
import { FACILITIES, ORIGIN, REPORT_META, routeById } from "@/lib/data";
import { slicePath } from "@/lib/geo";
import {
  getReports,
  useApp,
} from "@/lib/store";
import { pointAlong } from "@/lib/geo";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const DARK_BASE = `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`;
const DARK_REF = `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`;
const LIGHT_BASE = `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`;
const LIGHT_REF = `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`;

type LNS = typeof import("leaflet");

function addBasemap(L: LNS, map: LeafletMap, night: boolean): TileLayer[] {
  const opts = { maxZoom: 16, maxNativeZoom: 16 };
  const layers = [
    L.tileLayer(night ? DARK_BASE : LIGHT_BASE, opts),
    L.tileLayer(night ? DARK_REF : LIGHT_REF, { ...opts, opacity: 0.95 }),
  ];
  for (const layer of layers) layer.addTo(map);
  return layers;
}

function truckIcon(L: LNS, heading: number) {
  return L.divIcon({
    className: "rig-marker",
    html: `<div class="rig-marker-rot" style="transform:rotate(${heading}deg)"><div class="rig-marker-shape"></div></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 20],
  });
}

function convoyIcon(L: LNS, heading: number) {
  return L.divIcon({
    className: "convoy-marker",
    html: `<div class="convoy-rot" style="transform:rotate(${heading}deg)"><div class="convoy-shape"></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 16],
  });
}

function poiIcon(L: LNS, type: string, selected: boolean) {
  const kind =
    type === "truck_stop"
      ? "is-stop"
      : type === "rest_area"
        ? "is-rest"
        : type === "weigh_station"
          ? "is-scale"
          : "is-park";
  const svg =
    type === "truck_stop"
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14"/><path d="M14 8h2.5a2 2 0 0 1 2 2v6a2 2 0 1 0 4 0V9l-3-3"/><path d="M4 20h10"/></svg>`
      : type === "weigh_station"
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 3v18"/><path d="M5 8h14"/><path d="M7 21h10"/><path d="M8 8l-3 5h14l-3-5"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="5" y="9" width="14" height="10" rx="1"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/></svg>`;
  return L.divIcon({
    className: "poi-wrap",
    html: `<div class="poi-badge ${kind}${selected ? " is-sel" : ""}">${svg}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}


function reportIcon(L: LNS, kind: string) {
  const cls = REPORT_META[kind as keyof typeof REPORT_META]?.className ?? "report-hazard";
  return L.divIcon({
    className: "report-wrap",
    html: `<div class="report-dot ${cls}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function trafficColor(level: string): string {
  if (level === "heavy") return getComputedStyle(document.documentElement).getPropertyValue("--color-traffic-heavy").trim() || "#e05656";
  if (level === "moderate") return "#e0a247";
  if (level === "light") return "#7dcf8a";
  return "#3ecfbe";
}

export function MapCanvas() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    let unsub: (() => void) | undefined;
    let tiles: TileLayer[] = [];

    void (async () => {
      const mod = await import("leaflet");
      const L = ((mod as { default?: LNS }).default ?? (mod as unknown as LNS)) as LNS;
      if (cancelled || !rootRef.current) return;

      map = L.map(rootRef.current, {
        zoomControl: false,
        attributionControl: false,
        center: [ORIGIN.lat, ORIGIN.lng],
        zoom: 12,
        minZoom: 6,
        maxZoom: 16,
        zoomSnap: 0.5,
      });

      const night = useApp.getState().nightMap;
      tiles = addBasemap(L, map, night);

      const routeCasing: Polyline = L.polyline([], {
        color: "#06221e",
        weight: 10,
        opacity: 0.9,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(map);
      const routeLine: Polyline = L.polyline([], {
        color: "#3ecfbe",
        weight: 5,
        opacity: 0.95,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(map);
      const traveledLine: Polyline = L.polyline([], {
        color: "#8b93a7",
        weight: 5,
        opacity: 0.55,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(map);
      const trafficGroup: LayerGroup = L.layerGroup().addTo(map);
      const poiGroup: LayerGroup = L.layerGroup().addTo(map);
      const reportGroup: LayerGroup = L.layerGroup().addTo(map);
      const convoyGroup: LayerGroup = L.layerGroup().addTo(map);

      const truck: Marker = L.marker([ORIGIN.lat, ORIGIN.lng], {
        icon: truckIcon(L, 175),
        zIndexOffset: 1200,
        keyboard: false,
      }).addTo(map);
      const accuracy: Circle = L.circle([ORIGIN.lat, ORIGIN.lng], {
        radius: 110,
        color: "#3ecfbe",
        weight: 1,
        fillColor: "#3ecfbe",
        fillOpacity: 0.08,
      }).addTo(map);

      const convoyMarkers = new Map<string, Marker>();

      map.on("dragstart", () => {
        useApp.getState().setFollow(false);
      });

      let lastNight = night;
      let lastRouteKey = "";
      let lastPoiKey = "";
      let lastReportKey = "";
      let fittedRoute: string | null = null;

      const apply = (s: ReturnType<typeof useApp.getState>) => {
        if (!map) return;

        if (s.nightMap !== lastNight) {
          for (const t of tiles) t.remove();
          tiles = addBasemap(L, map, s.nightMap);
          lastNight = s.nightMap;
        }

        const route = s.nav.routeId ? routeById(s.nav.routeId) : undefined;
        const showRoute = Boolean(route && (s.nav.preview || s.nav.active || s.nav.arrived));
        const routeKey = `${s.nav.routeId}:${showRoute}:${s.layers.traffic}:${s.nav.active}`;
        if (routeKey !== lastRouteKey) {
          lastRouteKey = routeKey;
          trafficGroup.clearLayers();
          if (showRoute && route) {
            const latlngs = route.polyline.map((p) => [p.lat, p.lng] as [number, number]);
            routeCasing.setLatLngs(latlngs);
            routeLine.setLatLngs(latlngs);
            if (s.layers.traffic) {
              for (const z of route.traffic) {
                const slice = slicePath(route.polyline, z.fromMi, z.toMi);
                if (slice.length < 2) continue;
                L.polyline(
                  slice.map((p) => [p.lat, p.lng] as [number, number]),
                  {
                    color: trafficColor(z.level),
                    weight: 5,
                    opacity: 0.95,
                    lineJoin: "round",
                  },
                ).addTo(trafficGroup);
              }
            }
            if (s.nav.preview && fittedRoute !== route.id) {
              map.fitBounds(routeCasing.getBounds().pad(0.18), { animate: false });
              fittedRoute = route.id;
            }
          } else {
            routeCasing.setLatLngs([]);
            routeLine.setLatLngs([]);
            traveledLine.setLatLngs([]);
            fittedRoute = null;
          }
        }

        if (showRoute && route && s.nav.active) {
          const done = slicePath(route.polyline, 0, s.nav.traveledMi);
          traveledLine.setLatLngs(done.map((p) => [p.lat, p.lng] as [number, number]));
        }

        const pos = route
          ? pointAlong(route.polyline, s.nav.traveledMi)
          : { pos: ORIGIN, heading: 175 };
        truck.setLatLng([pos.pos.lat, pos.pos.lng]);
        const rot = truck.getElement()?.querySelector(".rig-marker-rot") as HTMLElement | null;
        if (rot) rot.style.transform = `rotate(${pos.heading}deg)`;
        accuracy.setLatLng([pos.pos.lat, pos.pos.lng]);

        if (s.nav.follow && (s.nav.active || s.nav.arrived)) {
          map.setView([pos.pos.lat, pos.pos.lng], Math.max(map.getZoom(), 12), { animate: false });
        }

        const poiKey = `${s.layers.stops}:${s.layers.rest}:${s.layers.scales}:${s.selectedFacilityId}`;
        if (poiKey !== lastPoiKey) {
          lastPoiKey = poiKey;
          poiGroup.clearLayers();
          for (const f of FACILITIES) {
            if (f.type === "truck_stop" && !s.layers.stops) continue;
            if (f.type === "rest_area" && !s.layers.rest) continue;
            if (f.type === "weigh_station" && !s.layers.scales) continue;
            if (f.type === "parking" && !s.layers.stops) continue;
            const m = L.marker([f.coord.lat, f.coord.lng], {
              icon: poiIcon(L, f.type, s.selectedFacilityId === f.id),
              keyboard: false,
            });
            m.on("click", () => useApp.getState().selectFacility(f.id));
            m.addTo(poiGroup);
          }
        }

        const reports = getReports();
        const reportKey = `${s.layers.reports}:${reports.length}:${reports[0]?.id ?? ""}`;
        if (reportKey !== lastReportKey) {
          lastReportKey = reportKey;
          reportGroup.clearLayers();
          if (s.layers.reports) {
            for (const r of reports) {
              const m = L.marker([r.coord.lat, r.coord.lng], {
                icon: reportIcon(L, r.kind),
                keyboard: false,
                zIndexOffset: 400,
              });
              const meta = REPORT_META[r.kind];
              m.bindPopup(`<strong>${meta.label}</strong><br/>${r.highway} · ${r.note}`);
              m.addTo(reportGroup);
            }
          }
        }

        if (s.layers.convoy) {
          for (const t of s.convoy) {
            let m = convoyMarkers.get(t.id);
            if (!m) {
              m = L.marker([t.coord.lat, t.coord.lng], {
                icon: convoyIcon(L, t.heading),
                keyboard: false,
                interactive: false,
                zIndexOffset: 300,
              }).addTo(convoyGroup);
              convoyMarkers.set(t.id, m);
            } else {
              m.setLatLng([t.coord.lat, t.coord.lng]);
              const cr = m.getElement()?.querySelector(".convoy-rot") as HTMLElement | null;
              if (cr) cr.style.transform = `rotate(${t.heading}deg)`;
            }
          }
        } else if (convoyMarkers.size) {
          convoyGroup.clearLayers();
          convoyMarkers.clear();
        }
      };

      apply(useApp.getState());
      unsub = useApp.subscribe(apply);
    })();

    return () => {
      cancelled = true;
      unsub?.();
      map?.remove();
    };
  }, []);

  return <div ref={rootRef} className="absolute inset-0 z-0" />;
}
