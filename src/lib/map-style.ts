import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

const LIBERTY = "https://tiles.openfreemap.org/styles/liberty";
const DARK = "https://tiles.openfreemap.org/styles/dark";

/**
 * English / Latin script only.
 * OpenFreeMap's default concatenates name:latin + name:nonlatin, which paints
 * Arabic street names across the Gulf. Never fall back to `name`.
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
  layout?: Record<string, unknown>;
  [key: string]: unknown;
};

type LooseStyle = {
  layers?: LooseLayer[];
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

function preferEnglish(style: LooseStyle): StyleSpecification {
  const layers = (style.layers ?? []).map((layer) => {
    const field = layer.layout?.["text-field"];
    if (!isPlaceLabel(field)) return layer;
    return { ...layer, layout: { ...layer.layout, "text-field": ENGLISH_NAME } };
  });
  return { ...style, layers } as StyleSpecification;
}

export async function loadEnglishBasemap(night: boolean): Promise<StyleSpecification> {
  const url = night ? DARK : LIBERTY;
  const hit = cache.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error("basemap");
  const style = preferEnglish((await res.json()) as LooseStyle);
  cache.set(url, style);
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
