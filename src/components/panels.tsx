import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Camera,
  CloudRain,
  Construction,
  Fuel,
  MapPin,
  ParkingCircle,
  Scale,
  Shield,
  Siren,
  TimerReset,
  TrafficCone,
  Utensils,
  Wrench,
  Wifi,
  Bath,
  Ban,
} from "lucide-react";
import { SlidePanel } from "@/components/slide-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/logo";
import {
  AMENITY_LABEL,
  REPORT_META,
  TRUCK_CLASSES,
  facilityById,
} from "@/lib/data";
import {
  getPosition,
  isScaleOpen,
  nearbyFacilities,
  searchFacilities,
  searchPlaces,
  useApp,
} from "@/lib/store";
import { geocodePlaces } from "@/lib/routing";
import { formatDiesel, formatHeight, formatHms, formatMi, formatWeight } from "@/lib/format";
import type { Amenity, Place, ReportKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const AMENITY_ICON: Record<Amenity, typeof Fuel> = {
  showers: Bath,
  food: Utensils,
  scale: Scale,
  def: Fuel,
  wash: Wrench,
  parking: ParkingCircle,
  wifi: Wifi,
  repair: Wrench,
};

export function SearchPanel() {
  const overlay = useApp((s) => s.overlay);
  const setOverlay = useApp((s) => s.setOverlay);
  const goToPlace = useApp((s) => s.goToPlace);
  const selectFacility = useApp((s) => s.selectFacility);
  const [q, setQ] = useState("");
  const [live, setLive] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const canned = useMemo(() => searchPlaces(q), [q]);
  const stops = useMemo(() => searchFacilities(q).slice(0, 8), [q]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const query = q.trim();
    if (query.length < 2) {
      setLive([]);
      setSearching(false);
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setSearching(true);
    const t = window.setTimeout(() => {
      void geocodePlaces(query, ac.signal)
        .then((places) => {
          if (!ac.signal.aborted) setLive(places);
        })
        .catch(() => {
          if (!ac.signal.aborted) setLive([]);
        })
        .finally(() => {
          if (!ac.signal.aborted) setSearching(false);
        });
    }, 280);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [q]);

  const places = useMemo(() => {
    const seen = new Set(canned.map((p) => p.name.toLowerCase()));
    const extra = live.filter((p) => !seen.has(p.name.toLowerCase()));
    return [...canned, ...extra].slice(0, 8);
  }, [canned, live]);

  return (
    <SlidePanel
      open={overlay === "search"}
      onClose={() => setOverlay("none")}
      title="Where to"
      subtitle="Any city, port, yard, or highway — worldwide"
    >
      <Input
        autoFocus={overlay === "search"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="City, yard, port, or stop"
        aria-label="Search destination"
      />
      <p className="mt-5 mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Destinations</p>
      {searching && places.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">Searching roads…</p>
      ) : null}
      {!searching && q.trim().length >= 2 && places.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">No matches. Try a city or highway name.</p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {places.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => goToPlace(p)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent"
            >
              <span className="grid size-10 place-items-center rounded-md bg-secondary text-primary">
                <MapPin className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block truncate text-sm text-muted-foreground">{p.subtitle}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {stops.length > 0 ? (
        <>
          <p className="mt-5 mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Stops & parking</p>
          <ul className="flex flex-col gap-1">
            {stops.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => selectFacility(f.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent"
                >
                  <span className="grid size-10 place-items-center rounded-md bg-secondary text-primary">
                    <Fuel className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{f.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">{f.subtitle}</span>
                  </span>
                  {f.diesel != null ? (
                    <span className="font-display text-lg font-semibold tabular-nums text-primary">
                      {formatDiesel(f.diesel)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </SlidePanel>
  );
}

const REPORT_ICONS: Record<ReportKind, typeof Shield> = {
  police: Shield,
  crash: Siren,
  hazard: AlertTriangle,
  construction: Construction,
  slowdown: TrafficCone,
  camera: Camera,
  weather: CloudRain,
  closed: Ban,
};

const REPORT_TINT: Record<ReportKind, string> = {
  police: "text-report-police",
  crash: "text-report-crash",
  hazard: "text-report-hazard",
  construction: "text-report-work",
  slowdown: "text-report-slow",
  camera: "text-report-camera",
  weather: "text-report-wx",
  closed: "text-report-closed",
};

export function ReportPanel() {
  const overlay = useApp((s) => s.overlay);
  const setOverlay = useApp((s) => s.setOverlay);
  const addReport = useApp((s) => s.addReport);
  const kinds = Object.keys(REPORT_META) as ReportKind[];

  return (
    <SlidePanel
      open={overlay === "report"}
      onClose={() => setOverlay("none")}
      title="Report"
      subtitle="Drops at your current mile marker"
    >
      <div className="grid grid-cols-2 gap-2">
        {kinds.map((kind) => {
          const meta = REPORT_META[kind];
          const Icon = REPORT_ICONS[kind];
          return (
            <button
              key={kind}
              type="button"
              onClick={() => addReport(kind)}
              className="flex min-h-24 flex-col items-start gap-2 rounded-xl bg-secondary px-4 py-4 text-left shadow-border transition-colors hover:bg-accent"
            >
              <Icon className={cn("size-5", REPORT_TINT[kind])} />
              <span className="font-medium">{meta.label}</span>
              <span className="text-xs text-muted-foreground">{meta.hint}</span>
            </button>
          );
        })}
      </div>
    </SlidePanel>
  );
}

export function LayersPanel() {
  const overlay = useApp((s) => s.overlay);
  const setOverlay = useApp((s) => s.setOverlay);
  const layers = useApp((s) => s.layers);
  const setLayers = useApp((s) => s.setLayers);
  const nightMap = useApp((s) => s.nightMap);
  const setNightMap = useApp((s) => s.setNightMap);
  const voiceOn = useApp((s) => s.voiceOn);
  const setVoice = useApp((s) => s.setVoice);

  const rows: { key: keyof typeof layers; label: string; hint: string }[] = [
    { key: "stops", label: "Truck stops", hint: "Fuel, showers, parking" },
    { key: "rest", label: "Rest areas", hint: "DOT lots" },
    { key: "scales", label: "Weigh stations", hint: "Open / closed" },
    { key: "reports", label: "Community reports", hint: "Police, crashes, hazards" },
    { key: "traffic", label: "Traffic colors", hint: "On the active route" },
    { key: "convoy", label: "Nearby fleet", hint: "Other trucks on the corridor" },
  ];

  return (
    <SlidePanel
      open={overlay === "layers"}
      onClose={() => setOverlay("none")}
      title="Map"
      subtitle="What you see in the cab"
    >
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <label
            key={row.key}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-3"
          >
            <span>
              <span className="block font-medium">{row.label}</span>
              <span className="block text-sm text-muted-foreground">{row.hint}</span>
            </span>
            <Switch checked={layers[row.key]} onCheckedChange={(v) => setLayers({ [row.key]: v })} />
          </label>
        ))}
      </div>
      <Separator className="my-3" />
      <label className="flex items-center justify-between gap-3 rounded-lg px-2 py-3">
        <span>
          <span className="block font-medium">Night map</span>
          <span className="block text-sm text-muted-foreground">Dark cab tiles</span>
        </span>
        <Switch checked={nightMap} onCheckedChange={setNightMap} />
      </label>
      <label className="flex items-center justify-between gap-3 rounded-lg px-2 py-3">
        <span>
          <span className="block font-medium">Voice guidance</span>
          <span className="block text-sm text-muted-foreground">Spoken turns</span>
        </span>
        <Switch checked={voiceOn} onCheckedChange={setVoice} />
      </label>
    </SlidePanel>
  );
}

export function ProfilePanel() {
  const overlay = useApp((s) => s.overlay);
  const setOverlay = useApp((s) => s.setOverlay);
  const profile = useApp((s) => s.profile);
  const setProfile = useApp((s) => s.setProfile);

  return (
    <SlidePanel
      open={overlay === "profile"}
      onClose={() => setOverlay("none")}
      title="Rig"
      subtitle="Used to skip low bridges and restricted roads"
    >
      <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Class</p>
      <div className="grid grid-cols-2 gap-2">
        {TRUCK_CLASSES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setProfile({ class: c.id })}
            className={cn(
              "rounded-xl px-3 py-3 text-left shadow-border transition-colors",
              profile.class === c.id ? "bg-primary text-primary-foreground" : "bg-secondary",
            )}
          >
            <span className="block font-medium">{c.label}</span>
            <span
              className={cn(
                "mt-1 block text-xs",
                profile.class === c.id ? "text-primary-foreground/80" : "text-muted-foreground",
              )}
            >
              {c.blurb}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-5">
        <Field
          label="Height"
          value={formatHeight(profile.heightFt)}
        >
          <Slider
            min={11}
            max={14}
            step={0.1}
            value={[profile.heightFt]}
            onValueChange={([v]) => setProfile({ heightFt: v ?? profile.heightFt })}
          />
        </Field>
        <Field label="Gross weight" value={formatWeight(profile.weightLbs)}>
          <Slider
            min={20000}
            max={84000}
            step={500}
            value={[profile.weightLbs]}
            onValueChange={([v]) => setProfile({ weightLbs: v ?? profile.weightLbs })}
          />
        </Field>
        <Field label="Overall length" value={`${Math.round(profile.lengthFt)} ft`}>
          <Slider
            min={24}
            max={80}
            step={1}
            value={[profile.lengthFt]}
            onValueChange={([v]) => setProfile({ lengthFt: v ?? profile.lengthFt })}
          />
        </Field>
        <Field label="Axles" value={String(profile.axles)}>
          <Slider
            min={2}
            max={8}
            step={1}
            value={[profile.axles]}
            onValueChange={([v]) => setProfile({ axles: v ?? profile.axles })}
          />
        </Field>
        <label className="flex items-center justify-between gap-3 rounded-lg py-1">
          <span>
            <span className="block font-medium">Hazmat</span>
            <span className="block text-sm text-muted-foreground">Skip tunnels that ban placards</span>
          </span>
          <Switch checked={profile.hazmat} onCheckedChange={(v) => setProfile({ hazmat: v })} />
        </label>
      </div>
    </SlidePanel>
  );
}

function Field({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium">{label}</p>
        <p className="font-display text-lg font-semibold tabular-nums">{value}</p>
      </div>
      {children}
    </div>
  );
}

export function FacilityPanel() {
  const overlay = useApp((s) => s.overlay);
  const setOverlay = useApp((s) => s.setOverlay);
  const id = useApp((s) => s.selectedFacilityId);
  const facility = id ? facilityById(id) : undefined;
  const pos = getPosition();

  if (!facility) {
    return (
      <SlidePanel open={overlay === "facility"} onClose={() => setOverlay("none")} title="Stop">
        <p className="text-sm text-muted-foreground">Select a pin on the map.</p>
      </SlidePanel>
    );
  }

  const dist = nearbyFacilities(pos.coord, 40).find((f) => f.id === facility.id)?.distanceMi;
  const openScale = facility.type === "weigh_station" ? isScaleOpen(facility.id) : null;

  return (
    <SlidePanel
      open={overlay === "facility"}
      onClose={() => setOverlay("none")}
      title={facility.name}
      subtitle={facility.subtitle}
    >
      <div className="flex flex-wrap gap-2">
        {openScale != null ? (
          <Badge variant={openScale ? "ok" : "warn"}>{openScale ? "Scale open" : "Scale closed"}</Badge>
        ) : null}
        {facility.diesel != null ? <Badge variant="ok">{formatDiesel(facility.diesel)} diesel</Badge> : null}
        {dist != null ? <Badge variant="muted">{formatMi(dist)} out</Badge> : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-secondary px-3 py-3">
          <p className="text-xs text-muted-foreground">Parking</p>
          <p className="font-display text-2xl font-semibold tabular-nums">
            {facility.parking.open}
            <span className="text-base text-muted-foreground">/{facility.parking.total}</span>
          </p>
        </div>
        <div className="rounded-xl bg-secondary px-3 py-3">
          <p className="text-xs text-muted-foreground">Rating</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{facility.rating.toFixed(1)}</p>
        </div>
      </div>
      <p className="mt-5 mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Amenities</p>
      <ul className="grid grid-cols-2 gap-2">
        {facility.amenities.map((a) => {
          const Icon = AMENITY_ICON[a];
          return (
            <li key={a} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
              <Icon className="size-4 text-primary" />
              {AMENITY_LABEL[a]}
            </li>
          );
        })}
      </ul>
    </SlidePanel>
  );
}

export function HosPanel() {
  const overlay = useApp((s) => s.overlay);
  const setOverlay = useApp((s) => s.setOverlay);
  const hos = useApp((s) => s.hos);
  const takeBreak = useApp((s) => s.takeBreak);
  const resetHos = useApp((s) => s.resetHos);

  const rows = [
    { label: "Drive", value: hos.driveSec, cap: "11-hour" },
    { label: "Break window", value: hos.breakInSec, cap: "8-hour" },
    { label: "Duty", value: hos.dutySec, cap: "14-hour" },
    { label: "70-hour cycle", value: hos.cycleSec, cap: "8-day" },
  ];

  return (
    <SlidePanel
      open={overlay === "hos"}
      onClose={() => setOverlay("none")}
      title="Hours of service"
      subtitle="Clocks run while you roll"
    >
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.label} className="rounded-xl bg-secondary px-4 py-3">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-muted-foreground">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.cap}</p>
            </div>
            <p className="font-display text-3xl font-semibold tabular-nums">{formatHms(row.value)}</p>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <Button className="flex-1" onClick={takeBreak}>
          <TimerReset className="size-4" />
          Log 30-min break
        </Button>
        <Button variant="secondary" onClick={resetHos}>
          Reset
        </Button>
      </div>
    </SlidePanel>
  );
}

export function OnboardPanel() {
  const overlay = useApp((s) => s.overlay);
  const completeOnboard = useApp((s) => s.completeOnboard);

  return (
    <SlidePanel open={overlay === "onboard"} onClose={completeOnboard} title="">
      <div className="flex flex-col gap-4">
        <Logo className="size-12" />
        <div>
          <p className="font-display text-3xl font-semibold tracking-tight">RigRadar</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Truck-legal routing, live reports, fuel, scales, and HOS — built for the cab.
          </p>
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="rounded-lg bg-secondary px-3 py-2">Search any city worldwide, then Start to roll.</li>
          <li className="rounded-lg bg-secondary px-3 py-2">Tap + to drop a cop, crash, or hazard pin.</li>
          <li className="rounded-lg bg-secondary px-3 py-2">Set your height and weight so low bridges get skipped.</li>
        </ul>
        <Button size="lg" className="mt-2" onClick={completeOnboard}>
          Take the wheel
        </Button>
      </div>
    </SlidePanel>
  );
}
