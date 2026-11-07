"use client";

import { useState } from "react";
import type { ScanReport, ScanError } from "@/lib/types";
import { copy } from "@/lib/content";
import Report from "./Report";
import { Badge } from "./ui";

type Phase = "idle" | "loading" | "done" | "error";

const STEPS = [
  "Meminta riwayat transfer ke explorer publik…",
  "Mengelompokkan transfer masuk per token…",
  "Memisahkan claim sendiri vs airdrop yang masuk otomatis…",
  "Mencocokkan ke registry airdrop yang sudah diverifikasi…",
  "Menyaring token spam dan menyusun laporan…",
];

export default function Scanner() {
  const [addr, setAddr] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deep, setDeep] = useState(false);

  const detected = /^0x[a-fA-F0-9]{40}$/.test(addr.trim())
    ? "EVM"
    : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim())
      ? "Solana"
      : null;

  async function run(value?: string) {
    const target = (value ?? addr).trim();
    if (!target) {
      setError("Masukkan alamat dulu.");
      setPhase("error");
      return;
    }
    setAddr(target);
    setPhase("loading");
    setError(null);
    setReport(null);
    setStep(0);

    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: target, depth: deep ? 400 : 60 }),
      });
      const data = (await res.json()) as ScanReport | ScanError;
      if (!res.ok || !("ok" in data) || data.ok !== true) {
        setError(("error" in data && data.error) || `Gagal memindai (HTTP ${res.status}).`);
        setPhase("error");
      } else {
        setReport(data);
        setPhase("done");
      }
    } catch (e) {
      setError((e as Error).message || "Koneksi ke server gagal.");
      setPhase("error");
    } finally {
      clearInterval(timer);
    }
  }

  return (
    <div id="cek" className="scroll-mt-20">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        className="panel p-4 sm:p-5"
      >
        <label htmlFor="addr" className="text-xs uppercase tracking-wider text-mute">
          Alamat wallet
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <input
              id="addr"
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder={copy.hero.placeholder}
              spellCheck={false}
              autoComplete="off"
              className="mono w-full rounded-lg border border-line-2 bg-ink-2 px-3 py-3 pr-20 text-sm text-white placeholder:text-mute/70"
            />
            {detected ? (
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                <Badge tone={detected === "EVM" ? "sky" : "violet"}>{detected}</Badge>
              </span>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={phase === "loading"}
            className="rounded-lg border border-neon-dim/50 bg-neon/15 px-5 py-3 text-sm font-semibold text-neon transition hover:bg-neon/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "loading" ? "Memindai…" : copy.hero.cta}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mute">
          <span>Coba:</span>
          {copy.samples.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => void run(s.value)}
              className="rounded-md border border-line-2 px-2 py-1 transition hover:border-neon-dim/50 hover:text-white"
            >
              {s.label}
            </button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={deep}
              onChange={(e) => setDeep(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#00ffa3]"
            />
            Solana mode dalam (lebih lambat)
          </label>
        </div>
        <p className="mt-2 text-xs text-mute">{copy.hero.hint}</p>
      </form>

      {phase === "loading" ? (
        <div className="panel mt-4 overflow-hidden p-4">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-line sweep">
            <span className="sr-only">Memindai</span>
          </div>
          <p className="mono mt-3 text-xs text-neon">{STEPS[step]}</p>
        </div>
      ) : null}

      {phase === "error" && error ? (
        <div className="panel mt-4 border-loss/40 p-4 text-sm text-loss">{error}</div>
      ) : null}

      {phase === "done" && report ? (
        <div className="mt-6">
          <Report report={report} />
        </div>
      ) : null}
    </div>
  );
}
