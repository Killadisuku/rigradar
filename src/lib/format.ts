export function formatHeight(ft: number): string {
  const feet = Math.floor(ft);
  const inches = Math.round((ft - feet) * 12);
  if (inches === 12) return `${feet + 1}'0"`;
  return `${feet}'${inches}"`;
}

export function formatWeight(lbs: number): string {
  return `${Math.round(lbs).toLocaleString("en-US")} lb`;
}

export function formatMi(mi: number): string {
  if (mi < 0.1) return `${Math.max(50, Math.round(mi * 5280))} ft`;
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

export function formatEta(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r} min`;
  if (r === 0) return `${h} hr`;
  return `${h} hr ${r} min`;
}

export function arrivalClock(min: number): string {
  const d = new Date(Date.now() + Math.max(0, min) * 60_000);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatHms(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function formatDiesel(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function timeAgo(ts: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - ts) / 60_000));
  if (min < 1) return "just now";
  if (min === 1) return "1 min ago";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h === 1 ? "1 hr ago" : `${h} hr ago`;
}

export function formatSpeed(mph: number): string {
  return String(Math.round(mph));
}
