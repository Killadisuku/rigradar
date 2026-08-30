import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

const BRIGHT = "https://tiles.openfreemap.org/styles/bright";
const DARK = "https://tiles.openfreemap.org/styles/dark";
const ESRI_SAT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/**
 * English / Latin script only.
 * OpenFreeMap concatenates latin + Arabic in the Gulf. Never fall back to `name`.
 */
const ENGLISH_NAME = [
  "coalesce",
  ["get", "name:en"],
  ["get", "name_en"],
  ["get", "name:latin"],
  ["get", "int_name"],
  ["get", "ref"],
];

type LooseLayer = {
  id?: string;
  type?: string;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  [key: string]: unknown;
};

type LooseStyle = {
  layers?: LooseLayer[];
  sources?: Record<string, unknown>;
  glyphs?: unknown;
  sprite?: unknown;
  center?: unknown;
  zoom?: unknown;
  bearing?: unknown;
  pitch?: unknown;
  [key: string]: unknown;
};

const cache = new Map<string, StyleSpecification>();

function isPlaceLabel(field: unknown): boolean {
  if (field == null) return false;
  const s = JSON.stringify(field);
  if (s.includes("name:nonlatin") || s.includes("name:latin") || s.includes("name_en") || s.includes("name:en")) {
    return true;
  }
  return /\["get","name"\]/.test(s) || s.includes("{name}");
}

function preferEnglish(style: LooseStyle): LooseStyle {
  const layers = (style.layers ?? []).map((layer) => {
    const field = layer.layout?.["text-field"];
    if (!isPlaceLabel(field)) return layer;
    return { ...layer, layout: { ...layer.layout, "text-field": ENGLISH_NAME } };
  });
  const { center: _c, zoom: _z, bearing: _b, pitch: _p, ...rest } = style;
  return { ...rest, layers };
}

function withSatellite(style: LooseStyle): StyleSpecification {
  const labels = (style.layers ?? [])
    .filter((layer) => layer.type === "symbol")
    .map((layer) => ({
      ...layer,
      paint: {
        ...(layer.paint ?? {}),
        "text-color": "#f4f4f5",
        "text-halo-color": "#111111",
        "text-halo-width": 1.5,
        "text-halo-blur": 0.4,
      },
    }));
  return {
    ...style,
    sources: {
      ...(style.sources ?? {}),
      esriSat: {
        type: "raster",
        tiles: [ESRI_SAT],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Esri",
      },
    },
    layers: [{ id: "esri-sat", type: "raster", source: "esriSat" }, ...labels],
  } as unknown as StyleSpecification;
}

export async function loadEnglishBasemap(night: boolean, satellite = false): Promise<StyleSpecification> {
  const url = night && !satellite ? DARK : BRIGHT;
  const key = `${url}|${satellite ? "sat" : "vec"}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error("basemap");
  const english = preferEnglish((await res.json()) as LooseStyle);
  const style = satellite ? withSatellite(english) : (english as StyleSpecification);
  cache.set(key, style);
  return style;
}

export function applyEnglishLabels(map: MapLibreMap): void {
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    const field = "layout" in layer ? (layer.layout as { "text-field"?: unknown } | undefined)?.["text-field"] : undefined;
    if (!isPlaceLabel(field)) continue;
    try {
      map.setLayoutProperty(layer.id, "text-field", ENGLISH_NAME as never);
    } catch {
      /* raster / fill layers */
    }
  }
}
