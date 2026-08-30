import { useEffect, useState } from "react";
import { MapCanvas } from "@/components/map-canvas";
import { Hud } from "@/components/hud";
import {
  FacilityPanel,
  HosPanel,
  LayersPanel,
  OnboardPanel,
  ProfilePanel,
  ReportPanel,
  SearchPanel,
} from "@/components/panels";
import { useApp } from "@/lib/store";

export function AppShell() {
  const [client, setClient] = useState(false);

  useEffect(() => {
    setClient(true);
  }, []);

  useEffect(() => {
    if (!client) return;
    const api = useApp.persist;
    const maybeOnboard = () => {
      if (!useApp.getState().seenOnboard) {
        useApp.getState().setOverlay("onboard");
      }
    };
    if (api.hasHydrated()) {
      maybeOnboard();
      return;
    }
    return api.onFinishHydration(maybeOnboard);
  }, [client]);

  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      useApp.getState().tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background">
      <div className="rr-map">
        <MapCanvas />
      </div>
      <p className="pointer-events-none absolute bottom-36 left-3 z-10 text-xs text-muted-foreground md:bottom-4">
        © OpenStreetMap
      </p>
      <Hud />
      {client ? (
        <>
          <SearchPanel />
          <ReportPanel />
          <LayersPanel />
          <ProfilePanel />
          <FacilityPanel />
          <HosPanel />
          <OnboardPanel />
        </>
      ) : null}
    </div>
  );
}
