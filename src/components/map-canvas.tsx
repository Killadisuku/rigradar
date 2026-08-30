import { useEffect, useRef } from "react";
import type { Circle, LayerGroup, Map as LeafletMap, Marker, Polyline, TileLayer } from "leaflet";
import { FACILITIES, REPORT_META } from "@/lib/data";
import { haversine, slicePath } from "@/lib/geo";
import {
  getReports,
  resolveRoute,
  useApp,
} from "@/lib/store";
import { pointAlong } from "@/lib/geo";

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_STREET = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";

type LNS = typeof import("leaflet");

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
  const nightMap = useApp((s) => s.nightMap);

  useEffect(() => {
    rootRef.current?.classList.toggle("is-night", nightMap);
  }, [nightMap]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    let unsub: (() => void) | undefined;
    let tiles: TileLayer | null = null;

    void (async () => {
      const mod = await import("leaflet");
      const L = ((mod as { default?: LNS }).default ?? (mod as unknown as LNS)) as LNS;
      if (cancelled || !rootRef.current) return;

      await new Promise<void>((resolve) => {
        const api = useApp.persist;
        if (api.hasHydrated()) {
          resolve();
          return;
        }
        api.onFinishHydration(() => resolve());
      });
      if (cancelled || !rootRef.current) return;
      const start = useApp.getState().origin;
      map = L.map(rootRef.current, {
        zoomControl: false,
        attributionControl: false,
        center: [start.lat, start.lng],
        zoom: 12,
        minZoom: 2,
        maxZoom: 18,
        zoomSnap: 0.5,
      });
      rootRef.current.classList.toggle("is-night", useApp.getState().nightMap);

      const osm = L.tileLayer(OSM, {
        maxZoom: 19,
        maxNativeZoom: 19,
      });
      let fellBack = false;
      osm.on("tileerror", () => {
        if (fellBack || !map) return;
        fellBack = true;
        osm.remove();
        tiles = L.tileLayer(ESRI_STREET, { maxZoom: 16, maxNativeZoom: 16 }).addTo(map);
      });
      tiles = osm.addTo(map);

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

      const truck: Marker = L.marker([start.lat, start.lng], {
        icon: truckIcon(L, 175),
        zIndexOffset: 1200,
        keyboard: false,
      }).addTo(map);
      const accuracy: Circle = L.circle([start.lat, start.lng], {
        radius: 110,
        color: "#3ecfbe",
        weight: 1,
        fillColor: "#3ecfbe",
        fillOpacity: 0.08,
      }).addTo(map);

      const convoyMarkers = new Map<string, Marker>();
      let quietMove = false;

      map.on("dragstart", () => {
        if (!quietMove) useApp.getState().setFollow(false);
      });

      let lastOriginKey = `${start.lat.toFixed(3)},${start.lng.toFixed(3)}`;
      let lastRouteKey = "";
      let lastPoiKey = "";
      let lastReportKey = "";
      let fittedRoute: string | null = null;

      const apply = (s: ReturnType<typeof useApp.getState>) => {
        if (!map || !tiles) return;

        map.getContainer().classList.toggle("is-night", s.nightMap);

        const originKey = `${s.origin.lat.toFixed(3)},${s.origin.lng.toFixed(3)}`;
        if (originKey !== lastOriginKey) {
          lastOriginKey = originKey;
          if (!s.nav.preview && !s.nav.active) {
            const recenter = () => {
              if (!map) return;
              quietMove = true;
              map.invalidateSize();
              map.setView([s.origin.lat, s.origin.lng], Math.max(map.getZoom(), 13), { animate: false });
              quietMove = false;
            };
            recenter();
            window.setTimeout(recenter, 80);
          }
        }

        const route = resolveRoute(s.nav.routeId);
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

        const pos = s.gps
          ? { pos: s.gps.coord, heading: s.gps.heading >= 0 ? s.gps.heading : 0 }
          : route && (s.nav.active || s.nav.arrived)
            ? pointAlong(route.polyline, s.nav.traveledMi)
            : { pos: s.origin, heading: 175 };
        truck.setLatLng([pos.pos.lat, pos.pos.lng]);
        const rot = truck.getElement()?.querySelector(".rig-marker-rot") as HTMLElement | null;
        if (rot) rot.style.transform = `rotate(${pos.heading}deg)`;
        accuracy.setLatLng([pos.pos.lat, pos.pos.lng]);
        accuracy.setRadius(Math.max(18, Math.min(240, s.gps?.accuracyM ?? 40)));

        if (s.nav.follow && !s.nav.preview) {
          const z = Math.max(map.getZoom(), s.gps ? 14 : 12);
          quietMove = true;
          map.setView([pos.pos.lat, pos.pos.lng], z, { animate: false });
          quietMove = false;
        }

        const poiKey = `${s.layers.stops}:${s.layers.rest}:${s.layers.scales}:${s.selectedFacilityId}:${originKey}:${s.extraFacilities.length}`;
        if (poiKey !== lastPoiKey) {
          lastPoiKey = poiKey;
          poiGroup.clearLayers();
          const pois = [...s.extraFacilities, ...FACILITIES];
          const seen = new Set<string>();
          for (const f of pois) {
            if (seen.has(f.id)) continue;
            seen.add(f.id);
            if (haversine(s.origin, f.coord) > 45) continue;
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
        const reportKey = `${s.layers.reports}:${reports.length}:${reports[0]?.id ?? ""}:${originKey}`;
        if (reportKey !== lastReportKey) {
          lastReportKey = reportKey;
          reportGroup.clearLayers();
          if (s.layers.reports) {
            for (const r of reports) {
              if (haversine(s.origin, r.coord) > 45) continue;
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

  return <div ref={rootRef} className={`absolute inset-0 z-0${nightMap ? " is-night" : ""}`} />;
}
