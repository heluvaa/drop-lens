import Scanner from "@/components/Scanner";
import { copy, site } from "@/lib/content";
import { CHAINS } from "@/lib/chains";
import { REGISTRY } from "@/lib/registry";
import { Badge } from "@/components/ui";

export default function Home() {
  const evmChains = CHAINS.length;
  const keyless = CHAINS.filter((c) => c.bs || c.rs).length;

  return (
    <>
      {/* Hero */}
      <section className="mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neon">
            <span className="h-1.5 w-1.5 rounded-full bg-neon dot-live" /> {copy.hero.kicker}
          </Badge>
          <Badge>{REGISTRY.length} airdrop terverifikasi</Badge>
          <Badge>{evmChains} chain EVM + Solana</Badge>
        </div>
        <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          <span className="text-gradient">{copy.hero.title}</span>
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mute sm:text-base">{copy.hero.sub}</p>
      </section>

      <Scanner />

      {/* Cara kerja */}
      <section id="cara" className="mt-14 scroll-mt-20">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Cara kerjanya</h2>
          <p className="text-xs text-mute">
            {keyless} dari {evmChains} chain EVM jalan tanpa API key
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {copy.how.map((h) => (
            <div key={h.t} className="panel reveal p-4">
              <h3 className="mono text-xs uppercase tracking-wider text-neon">{h.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{h.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Apa yang keluar dari laporan */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-white">Yang keluar di laporan</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {copy.ideas.map((i) => (
            <div key={i.t} className="panel reveal flex gap-3 p-4">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-neon" />
              <div>
                <h3 className="text-sm font-medium text-white">{i.t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-mute">{i.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cakupan + env */}
      <section className="mt-10 grid gap-3 lg:grid-cols-2">
        <div className="panel reveal p-4">
          <h2 className="text-sm font-semibold text-white">Soal cakupan</h2>
          <p className="mt-2 text-sm leading-relaxed text-mute">{copy.coverageNote}</p>
          <div className="mono mt-3 space-y-1 text-xs text-mute">
            <div>· Blockscout v2/v1 — Ethereum, OP, ZKsync, Scroll, Celo, Unichain, World, Ink, ApeChain, Rootstock</div>
            <div>· Routescan — Avalanche (tanpa key)</div>
            <div>· Etherscan V2 — sisanya setelah key diisi</div>
          </div>
        </div>
        <div className="panel reveal p-4">
          <h2 className="text-sm font-semibold text-white">Biar lebih lengkap</h2>
          <div className="mt-2 space-y-2">
            {copy.envNote.map((e) => (
              <div key={e.k} className="panel-tight p-3">
                <div className="mono text-xs text-neon">{e.k}</div>
                <p className="mt-1 text-xs leading-relaxed text-mute">{e.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mt-10 scroll-mt-20">
        <h2 className="mb-4 text-lg font-semibold text-white">Pertanyaan yang sering muncul</h2>
        <div className="space-y-2">
          {copy.faq.map((f) => (
            <details key={f.q} className="panel p-4">
              <summary className="cursor-pointer text-sm text-white">{f.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-mute">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="mt-10 text-center text-xs text-mute">
        {site.name} bukan layanan resmi proyek mana pun. Semua angka berasal dari data publik on-chain — verifikasi
        sendiri sebelum mengambil keputusan.
      </p>
    </>
  );
}