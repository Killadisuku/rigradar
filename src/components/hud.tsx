import {
  Clock,
  Fuel,
  Layers,
  Locate,
  MapPin,
  Plus,
  Search,
  Shield,
  Truck,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";
import {
  currentInstruction,
  getPosition,
  nearbyFacilities,
  nextInstruction,
  remainingMin,
  reportsOnRoute,
  resolvePlace,
  resolveRoute,
  useApp,
} from "@/lib/store";
import { POSTED_LIMIT } from "@/lib/data";
import { startGps } from "@/lib/gps";
import { arrivalClock, formatDiesel, formatEta, formatHms, formatMi, formatSpeed } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Hud() {
  return (
    <div className="rr-hud">
      <TopChrome />
      <AlertBanner />
      <SpeedBubble />
      <SideControls />
      <Dock />
    </div>
  );
}

function TopChrome() {
  const nav = useApp((s) => s.nav);
  const overlay = useApp((s) => s.overlay);
  const setOverlay = useApp((s) => s.setOverlay);
  const voiceOn = useApp((s) => s.voiceOn);
  const setVoice = useApp((s) => s.setVoice);
  const stopNav = useApp((s) => s.stopNav);
  const route = resolveRoute(nav.routeId);
  const ins = route ? currentInstruction(route, nav.traveledMi) : null;
  const next = route ? nextInstruction(route, nav.traveledMi) : null;
  const distToNext = next ? next.atMi - nav.traveledMi : route ? route.distanceMi - nav.traveledMi : 0;

  if (nav.active && ins) {
    return (
      <div className="pointer-events-auto absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] md:inset-x-4 md:top-4">
        <div className="rr-banner flex items-stretch overflow-hidden rounded-2xl bg-card shadow-border">
          <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
            <p className="font-display text-3xl leading-none font-semibold tracking-tight">{ins.primary}</p>
            <p className="mt-1 truncate text-sm text-muted-foreground">{ins.secondary}</p>
          </div>
          <div className="flex w-24 flex-col items-end justify-center bg-primary px-3 py-3 text-primary-foreground">
            <p className="font-display text-2xl leading-none font-semibold tabular-nums">{formatMi(distToNext)}</p>
            <p className="mt-1 text-xs text-primary-foreground/80">{next ? "then turn" : "arrive"}</p>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button
            variant="secondary"
            size="icon"
            className="size-11 rounded-full shadow-border"
            onClick={() => setVoice(!voiceOn)}
            aria-label={voiceOn ? "Mute voice" : "Unmute voice"}
          >
            {voiceOn ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="size-11 rounded-full shadow-border"
            onClick={stopNav}
            aria-label="End navigation"
          >
            <X />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-2 md:inset-x-4 md:top-4">
      <button
        type="button"
        onClick={() => setOverlay(overlay === "search" ? "none" : "search")}
        className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-card px-4 shadow-border"
      >
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Where to, driver?</span>
        <GpsChip />
      </button>
      <Button
        variant="secondary"
        size="icon"
        className="size-12 shrink-0 rounded-full shadow-border"
        onClick={() => setOverlay("layers")}
        aria-label="Map layers"
      >
        <Layers />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        className="size-12 shrink-0 rounded-full shadow-border"
        onClick={() => setOverlay("profile")}
        aria-label="Rig profile"
      >
        <Truck />
      </Button>
    </div>
  );
}

function GpsChip() {
  const status = useApp((s) => s.gpsStatus);
  if (status === "live") {
    return <span className="shrink-0 text-xs font-medium text-primary">GPS</span>;
  }
  if (status === "pending") {
    return <span className="shrink-0 text-xs text-muted-foreground">fix…</span>;
  }
  if (status === "denied") {
    return <span className="shrink-0 text-xs text-warn">off</span>;
  }
  return null;
}

function AlertBanner() {
  const alert = useApp((s) => s.alert);
  const nav = useApp((s) => s.nav);
  const clearAlert = useApp((s) => s.clearAlert);
  if (!alert) return null;
  return (
    <div
      className={cn(
        "pointer-events-auto absolute inset-x-3 md:inset-x-4",
        nav.active ? "top-40" : "top-28",
      )}
    >
      <button
        type="button"
        onClick={clearAlert}
        className="flex w-full items-start gap-3 rounded-xl bg-card px-4 py-3 text-left shadow-border"
      >
        <Shield className="mt-0.5 size-4 shrink-0 text-warn" />
        <span className="min-w-0 flex-1 text-sm">{alert}</span>
        <X className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}

function SpeedBubble() {
  const nav = useApp((s) => s.nav);
  const gps = useApp((s) => s.gps);
  const speed = gps && Date.now() - gps.at < 8000 ? gps.speedMph : nav.active ? nav.speedMph : 0;
  const speeding = speed > POSTED_LIMIT + 2;
  return (
    <div className="pointer-events-none absolute bottom-56 left-3 md:bottom-8 md:left-4">
      <div
        className={cn(
          "flex size-20 flex-col items-center justify-center rounded-full bg-card shadow-border",
          speeding && "bg-warn text-background",
        )}
      >
        <span className="font-display text-3xl leading-none font-semibold tabular-nums">
          {formatSpeed(speed)}
        </span>
        <span className={cn("text-xs", speeding ? "text-background/80" : "text-muted-foreground")}>
          {POSTED_LIMIT}
        </span>
      </div>
    </div>
  );
}

function SideControls() {
  const setOverlay = useApp((s) => s.setOverlay);
  const follow = useApp((s) => s.nav.follow);
  const gpsStatus = useApp((s) => s.gpsStatus);
  const setFollow = useApp((s) => s.setFollow);
  return (
    <div className="pointer-events-auto absolute right-3 bottom-56 flex flex-col gap-2 md:top-1/3 md:right-4 md:bottom-auto">
      {!follow || gpsStatus !== "live" ? (
        <Button
          variant="secondary"
          size="icon"
          className="size-12 rounded-full shadow-border"
          onClick={() => {
            startGps();
            setFollow(true);
          }}
          aria-label="Use my GPS"
        >
          <Locate />
        </Button>
      ) : null}
      <Button
        size="icon"
        className="size-14 rounded-full"
        onClick={() => setOverlay("report")}
        aria-label="Report hazard"
      >
        <Plus className="size-6" />
      </Button>
    </div>
  );
}

function Dock() {
  const nav = useApp((s) => s.nav);
  const hos = useApp((s) => s.hos);
  const overlay = useApp((s) => s.overlay);
  const setOverlay = useApp((s) => s.setOverlay);
  const startNav = useApp((s) => s.startNav);
  const stopNav = useApp((s) => s.stopNav);
  const originLabel = useApp((s) => s.originLabel);
  const pos = getPosition();
  const near = nearbyFacilities(pos.coord, 1)[0];
  const dest = resolvePlace(nav.destId);
  const route = resolveRoute(nav.routeId);

  if (overlay !== "none" && overlay !== "report") return null;

  if (nav.arrived && dest) {
    return (
      <div className="rr-dock pointer-events-auto absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:inset-x-auto md:right-4 md:bottom-4 md:w-[420px]">
        <div className="rounded-3xl bg-card px-5 py-4 shadow-dock">
          <p className="font-display text-2xl font-semibold">Arrived</p>
          <p className="mt-1 text-sm text-muted-foreground">{dest.name}</p>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => setOverlay("search")}>
              Next load
            </Button>
            <Button variant="secondary" onClick={stopNav}>
              Clear
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if ((nav.preview || nav.active) && dest && route) {
    const remainMi = Math.max(0, route.distanceMi - nav.traveledMi);
    const eta = remainingMin(route, nav.traveledMi, nav.active ? nav.speedMph : 0);
    const onRoute = reportsOnRoute(route).length;
    const legal = route.restrictions.every((r) => r.avoided || r.type !== "low_bridge");

    return (
      <div className="rr-dock pointer-events-auto absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:inset-x-auto md:right-4 md:bottom-4 md:w-[420px]">
        <div className="rounded-3xl bg-card px-5 pt-4 pb-4 shadow-dock">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-2xl leading-none font-semibold tracking-tight">{dest.name}</p>
              <p className="mt-1 truncate text-sm text-muted-foreground">{route.highways.join(" · ")}</p>
            </div>
            <Badge variant={legal ? "ok" : "warn"}>
              {route.id.startsWith("live-") ? "Live roads" : legal ? "Truck-legal" : "Check clearance"}
            </Badge>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="ETA" value={formatEta(eta)} />
            <Stat label="Remain" value={formatMi(remainMi)} />
            <Stat label="Arrive" value={arrivalClock(eta)} />
          </div>
          <button
            type="button"
            onClick={() => setOverlay("hos")}
            className="mt-3 flex w-full items-center justify-between rounded-xl bg-secondary px-3 py-2.5"
          >
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" />
              Drive left
            </span>
            <span className="font-display text-lg font-semibold tabular-nums">{formatHms(hos.driveSec)}</span>
          </button>
          {route.restrictions.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1">
              {route.restrictions.slice(0, 2).map((r) => (
                <li key={r.atMi} className="text-xs text-muted-foreground">
                  {r.avoided ? "Avoided · " : ""}
                  {r.label}
                </li>
              ))}
            </ul>
          ) : null}
          {onRoute > 0 && nav.preview ? (
            <p className="mt-2 text-xs text-muted-foreground">{onRoute} live reports on this route</p>
          ) : null}
          <div className="mt-4 flex gap-2">
            {nav.preview ? (
              <>
                <Button className="flex-1" size="lg" onClick={startNav}>
                  Start
                </Button>
                <Button variant="secondary" size="lg" onClick={stopNav}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="secondary" className="flex-1" onClick={() => setOverlay("hos")}>
                HOS clocks
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rr-dock pointer-events-auto absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:inset-x-auto md:right-4 md:bottom-4 md:w-[420px]">
      <div className="rounded-3xl bg-card px-5 pt-4 pb-4 shadow-dock">
        <div className="flex items-center gap-3">
          <Logo className="size-9" />
          <div className="min-w-0">
            <p className="font-display text-xl leading-none font-semibold tracking-tight">RigRadar</p>
            <p className="mt-1 truncate text-sm text-muted-foreground">Demo GPS · {originLabel}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setOverlay("hos")}
            className="rounded-xl bg-secondary px-3 py-3 text-left"
          >
            <p className="text-xs text-muted-foreground">Drive</p>
            <p className="font-display text-lg font-semibold tabular-nums">{formatHms(hos.driveSec)}</p>
          </button>
          <button
            type="button"
            onClick={() => setOverlay("search")}
            className="rounded-xl bg-secondary px-3 py-3 text-left"
          >
            <p className="text-xs text-muted-foreground">Parking</p>
            <p className="font-display text-lg font-semibold tabular-nums">
              {near ? `${near.parking.open}` : "—"}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setOverlay("search")}
            className="rounded-xl bg-secondary px-3 py-3 text-left"
          >
            <p className="text-xs text-muted-foreground">Diesel</p>
            <p className="font-display text-lg font-semibold tabular-nums text-primary">
              {near?.diesel != null ? formatDiesel(near.diesel) : "—"}
            </p>
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => setOverlay("search")}>
            <MapPin className="size-4" />
            Navigate
          </Button>
          <Button variant="secondary" onClick={() => setOverlay("search")}>
            <Fuel className="size-4" />
            Stops
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-lg leading-tight font-semibold tabular-nums">{value}</p>
    </div>
  );
}
