import { useMemo, useState, type ReactNode } from "react";
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
import { formatDiesel, formatHeight, formatHms, formatMi, formatWeight } from "@/lib/format";
import type { Amenity, ReportKind } from "@/lib/types";
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
  const previewDestination = useApp((s) => s.previewDestination);
  const selectFacility = useApp((s) => s.selectFacility);
  const [q, setQ] = useState("");
  const places = useMemo(() => searchPlaces(q), [q]);
  const stops = useMemo(() => searchFacilities(q).slice(0, 8), [q]);

  return (
    <SlidePanel
      open={overlay === "search"}
      onClose={() => setOverlay("none")}
      title="Where to"
      subtitle="Truck-legal routes from the DFW corridor"
    >
      <Input
        autoFocus={overlay === "search"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="City, yard, port, or stop"
        aria-label="Search destination"
      />
      <p className="mt-5 mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Destinations</p>
      <ul className="flex flex-col gap-1">
        {places.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => previewDestination(p.id)}
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
    { key: "reports", label: "Community reports", hint: "Police, hazards, work" },
    { key: "traffic", label: "Live traffic", hint: "Colored on your route" },
    { key: "convoy", label: "Nearby trucks", hint: "Fleet around you" },
  ];

  return (
    <SlidePanel open={overlay === "layers"} onClose={() => setOverlay("none")} title="Map layers">
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{row.label}</p>
              <p className="text-sm text-muted-foreground">{row.hint}</p>
            </div>
            <Switch checked={layers[row.key]} onCheckedChange={(v) => setLayers({ [row.key]: v })} />
          </li>
        ))}
      </ul>
      <Separator className="my-2" />
      <div className="flex items-center justify-between gap-3 py-3">
        <div>
          <p className="font-medium">Night map</p>
          <p className="text-sm text-muted-foreground">Dark tiles for cab use</p>
        </div>
        <Switch checked={nightMap} onCheckedChange={setNightMap} />
      </div>
      <div className="flex items-center justify-between gap-3 py-3">
        <div>
          <p className="font-medium">Voice guidance</p>
          <p className="text-sm text-muted-foreground">Turn and hazard callouts</p>
        </div>
        <Switch checked={voiceOn} onCheckedChange={setVoice} />
      </div>
      <p className="pt-2 text-xs text-muted-foreground">Map data © OpenStreetMap, tiles © CARTO</p>
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
      title="Your rig"
      subtitle="Used for clearance, weight, and hazmat"
    >
      <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Class</p>
      <div className="grid grid-cols-1 gap-2">
        {TRUCK_CLASSES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setProfile({ class: c.id })}
            className={cn(
              "flex items-center justify-between rounded-xl px-4 py-3 text-left shadow-border transition-colors",
              profile.class === c.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent",
            )}
          >
            <span>
              <span className="block font-medium">{c.label}</span>
              <span
                className={cn(
                  "block text-sm",
                  profile.class === c.id ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {c.blurb}
              </span>
            </span>
          </button>
        ))}
      </div>

      <Field label="Height" value={formatHeight(profile.heightFt)}>
        <Slider
          min={12.5}
          max={14.5}
          step={0.0833}
          value={[profile.heightFt]}
          onValueChange={([v]) => setProfile({ heightFt: v ?? 13.5 })}
        />
      </Field>
      <Field label="Gross weight" value={formatWeight(profile.weightLbs)}>
        <Slider
          min={10000}
          max={82000}
          step={500}
          value={[profile.weightLbs]}
          onValueChange={([v]) => setProfile({ weightLbs: v ?? 80000 })}
        />
      </Field>
      <Field label="Overall length" value={`${Math.round(profile.lengthFt)} ft`}>
        <Slider
          min={20}
          max={85}
          step={1}
          value={[profile.lengthFt]}
          onValueChange={([v]) => setProfile({ lengthFt: v ?? 73 })}
        />
      </Field>
      <Field label="Axles" value={String(profile.axles)}>
        <Slider
          min={2}
          max={8}
          step={1}
          value={[profile.axles]}
          onValueChange={([v]) => setProfile({ axles: v ?? 5 })}
        />
      </Field>

      <div className="mt-4 flex items-center justify-between gap-3 py-2">
        <div>
          <p className="font-medium">Hazmat plates</p>
          <p className="text-sm text-muted-foreground">Avoids restricted tunnels</p>
        </div>
        <Switch checked={profile.hazmat} onCheckedChange={(v) => setProfile({ hazmat: v })} />
      </div>
    </SlidePanel>
  );
}

function Field({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-display text-lg font-semibold tabular-nums">{value}</p>
      </div>
      {children}
    </div>
  );
}

export function FacilityPanel() {
  const overlay = useApp((s) => s.overlay);
  const selectedFacilityId = useApp((s) => s.selectedFacilityId);
  const selectFacility = useApp((s) => s.selectFacility);
  const pos = getPosition();
  const f = selectedFacilityId ? facilityById(selectedFacilityId) : undefined;
  const distance = f ? nearbyFacilities(pos.coord, 99).find((x) => x.id === f.id)?.distanceMi : undefined;

  return (
    <SlidePanel
      open={overlay === "facility" && Boolean(f)}
      onClose={() => selectFacility(null)}
      title={f?.name ?? "Stop"}
      subtitle={f?.subtitle}
    >
      {f ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {f.diesel != null ? <Badge>{formatDiesel(f.diesel)} diesel</Badge> : null}
            {f.def != null ? <Badge variant="muted">{formatDiesel(f.def)} DEF</Badge> : null}
            {distance != null ? <Badge variant="muted">{formatMi(distance)}</Badge> : null}
            {f.type === "weigh_station" ? (
              <Badge variant={isScaleOpen(f.id) ? "warn" : "ok"}>
                {isScaleOpen(f.id) ? "Scale open" : "Scale closed"}
              </Badge>
            ) : (
              <Badge variant={f.parking.open > 6 ? "ok" : f.parking.open > 0 ? "warn" : "danger"}>
                {f.parking.open} of {f.parking.total} parking
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Rated {f.rating.toFixed(1)} by drivers this week.</p>
          <div className="flex flex-wrap gap-2">
            {f.amenities.map((a) => {
              const Icon = AMENITY_ICON[a];
              return (
                <span
                  key={a}
                  className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-foreground"
                >
                  <Icon className="size-3.5 text-muted-foreground" />
                  {AMENITY_LABEL[a]}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </SlidePanel>
  );
}

export function HosPanel() {
  const overlay = useApp((s) => s.overlay);
  const setOverlay = useApp((s) => s.setOverlay);
  const hos = useApp((s) => s.hos);
  const takeBreak = useApp((s) => s.takeBreak);
  const resetHos = useApp((s) => s.resetHos);

  const clocks = [
    { label: "Drive remaining", value: hos.driveSec, max: 11 * 3600, hint: "11-hour driving limit" },
    { label: "Until 30-min break", value: hos.breakInSec, max: 8 * 3600, hint: "8 hours after last rest" },
    { label: "On-duty window", value: hos.dutySec, max: 14 * 3600, hint: "14-hour clock" },
    { label: "70-hour cycle", value: hos.cycleSec, max: 70 * 3600, hint: "8-day cycle" },
  ];

  return (
    <SlidePanel
      open={overlay === "hos"}
      onClose={() => setOverlay("none")}
      title="Hours of service"
      subtitle="Clocks count down while you roll"
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" onClick={takeBreak}>
            Log 30-min break
          </Button>
          <Button variant="secondary" onClick={resetHos} aria-label="Reset clocks">
            <TimerReset />
          </Button>
        </div>
      }
    >
      <ul className="flex flex-col gap-4">
        {clocks.map((c) => {
          const pct = Math.max(0, Math.min(100, (c.value / c.max) * 100));
          const warn = pct < 18;
          return (
            <li key={c.label}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className={cn("font-display text-2xl font-semibold tabular-nums", warn && "text-warn")}>
                  {formatHms(c.value)}
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-accent">
                <div
                  className={cn("h-full rounded-full", warn ? "bg-warn" : "bg-primary")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
            </li>
          );
        })}
      </ul>
    </SlidePanel>
  );
}

export function OnboardPanel() {
  const overlay = useApp((s) => s.overlay);
  const completeOnboard = useApp((s) => s.completeOnboard);
  const profile = useApp((s) => s.profile);
  const setProfile = useApp((s) => s.setProfile);

  return (
    <SlidePanel
      open={overlay === "onboard"}
      onClose={completeOnboard}
      title="Set your rig"
      subtitle="RigRadar keeps you off low bridges and closed scales"
      footer={
        <Button className="w-full" size="lg" onClick={completeOnboard}>
          Start driving
        </Button>
      }
    >
      <div className="mb-5 flex items-center gap-3">
        <Logo className="size-10" />
        <p className="text-sm text-muted-foreground">
          Demo GPS is parked at I-35E & I-20 in Dallas. Pick a destination to roll a truck-legal route.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {TRUCK_CLASSES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setProfile({ class: c.id })}
            className={cn(
              "rounded-xl px-4 py-3 text-left shadow-border transition-colors",
              profile.class === c.id ? "bg-primary text-primary-foreground" : "bg-secondary",
            )}
          >
            <span className="block font-medium">{c.label}</span>
            <span
              className={cn(
                "block text-sm",
                profile.class === c.id ? "text-primary-foreground/80" : "text-muted-foreground",
              )}
            >
              {c.blurb}
            </span>
          </button>
        ))}
      </div>
    </SlidePanel>
  );
}
