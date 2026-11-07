import type { ReactNode } from "react";

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtNum(n: number, max = 6): string {
  if (!Number.isFinite(n)) return "-";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e12) return n.toExponential(3);
  if (abs >= 1) return n.toLocaleString("id-ID", { maximumFractionDigits: Math.min(max, 4) });
  return n.toLocaleString("id-ID", { maximumFractionDigits: 8 });
}

export function fmtUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "-";
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;
}

export function short(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function Badge({
  children,
  tone = "line",
}: {
  children: ReactNode;
  tone?: "line" | "neon" | "warn" | "loss" | "sky" | "violet" | "profit";
}) {
  const tones: Record<string, string> = {
    line: "border-line-2 text-mute",
    neon: "border-neon-dim/50 text-neon",
    profit: "border-profit/50 text-profit",
    warn: "border-warn/50 text-warn",
    loss: "border-loss/50 text-loss",
    sky: "border-sky/50 text-sky",
    violet: "border-violet/50 text-violet",
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neon" | "sky" | "warn" | "violet";
}) {
  const toneCls: Record<string, string> = {
    neon: "text-neon",
    sky: "text-sky",
    warn: "text-warn",
    violet: "text-violet",
  };
  return (
    <div className="panel p-4">
      <div className="text-[11px] uppercase tracking-wider text-mute">{label}</div>
      <div className={`mono mt-1 text-xl font-semibold ${tone ? toneCls[tone] : "text-white"}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-mute">{sub}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">{children}</h2>
      {note ? <div className="text-xs text-mute">{note}</div> : null}
    </div>
  );
}
