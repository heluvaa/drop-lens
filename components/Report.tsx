import type { ScanReport, CoverageStatus } from "@/lib/types";
import { Badge, SectionTitle, Stat, fmtDate, fmtNum, fmtUsd, short } from "./ui";

const STATUS_TONE: Record<CoverageStatus, "profit" | "warn" | "loss" | "line"> = {
  scanned: "profit",
  partial: "warn",
  skipped: "line",
  error: "loss",
};

const STATUS_LABEL: Record<CoverageStatus, string> = {
  scanned: "dipindai",
  partial: "sebagian",
  skipped: "dilewati",
  error: "gagal",
};

export default function Report({ report }: { report: ScanReport }) {
  const { profile, totals, events, spam, coverage, notes } = report;

  return (
    <div className="space-y-6">
      {/* Kepala laporan */}
      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={report.kind === "evm" ? "sky" : "violet"}>
            {report.kind === "evm" ? "EVM" : "Solana"}
          </Badge>
          {profile.label ? <Badge tone="neon">{profile.label}</Badge> : null}
          {profile.proxyType ? <Badge tone="warn">proxy: {profile.proxyType}</Badge> : null}
          {profile.isContract ? <Badge tone="warn">alamat kontrak</Badge> : null}
          <Badge tone={report.keys.etherscan ? "profit" : "line"}>
            {report.keys.etherscan ? "ETHERSCAN key aktif" : "tanpa key Etherscan"}
          </Badge>
          <Badge tone={report.keys.helius ? "profit" : "line"}>
            {report.keys.helius ? "HELIUS key aktif" : "Solana publik"}
          </Badge>
          <span className="mono text-[11px] text-mute">{report.elapsedMs} ms</span>
        </div>
        <div className="mono mt-3 break-all text-sm text-white">{report.address}</div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Event airdrop" value={totals.events} tone="neon" sub={`${totals.chainsWithEvents} chain`} />
        <Stat label="Di-claim sendiri" value={totals.claims} sub="wallet yang kirim tx" />
        <Stat label="Masuk otomatis" value={totals.pushes} sub="push tanpa aksi wallet" />
        <Stat
          label="Estimasi nilai"
          value={fmtUsd(totals.usd)}
          tone="sky"
          sub={`${totals.usdCovered}/${totals.events} ada harga`}
        />
        <Stat label="Token dikarantina" value={totals.spamCount} tone="warn" sub="spam / phishing" />
      </div>

      {/* Profil wallet */}
      <section className="reveal">
        <SectionTitle note="umur wallet = transaksi paling awal yang tercatat">Profil wallet</SectionTitle>
        <div className="panel divide-y divide-line">
          <Row label="Umur wallet">
            {profile.ageDays !== null ? (
              <>
                <span className="mono text-white">{profile.ageDays.toLocaleString("id-ID")}</span> hari
              </>
            ) : (
              <span className="text-mute">tidak diketahui dari chain yang dipindai</span>
            )}
          </Row>
          <Row label="Aktivitas pertama">
            {profile.firstActivity ? (
              <a
                className="mono text-sky hover:underline"
                href={profile.firstActivity.explorerUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                {fmtDate(profile.firstActivity.date)} · {profile.firstActivity.chainName} · {short(profile.firstActivity.txHash, 8, 6)}
              </a>
            ) : (
              <span className="text-mute">-</span>
            )}
          </Row>
          <Row label="Aktivitas terakhir">
            {profile.lastActivity ? (
              <span className="mono">
                {fmtDate(profile.lastActivity.date)} · {profile.lastActivity.chainName}
              </span>
            ) : (
              <span className="text-mute">-</span>
            )}
          </Row>
          <Row label="Jumlah transaksi">
            {profile.txCount !== null ? (
              <span className="mono text-white">{profile.txCount.toLocaleString("id-ID")}</span>
            ) : (
              <span className="text-mute">tidak tersedia</span>
            )}
          </Row>
          <Row label="Transfer token tercatat">
            {profile.transferCount !== null ? (
              <span className="mono text-white">{profile.transferCount.toLocaleString("id-ID")}</span>
            ) : (
              <span className="text-mute">tidak tersedia</span>
            )}
          </Row>
          <Row label="Chain aktif">
            <span className="mono text-white">{profile.chainsActive}</span>
            <span className="ml-2 text-mute">dari {coverage.length} yang dicek</span>
          </Row>
          <Row label="Saldo native">
            {profile.native.length ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {profile.native
                  .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))
                  .slice(0, 8)
                  .map((n) => (
                    <span key={n.chainKey} className="mono">
                      {fmtNum(n.balance, 6)} <span className="text-mute">{n.symbol}</span>
                      {n.usd !== null ? <span className="text-mute"> · {fmtUsd(n.usd)}</span> : null}
                    </span>
                  ))}
              </div>
            ) : (
              <span className="text-mute">kosong di chain yang bisa dibaca</span>
            )}
          </Row>
        </div>
      </section>

      {/* Daftar airdrop */}
      <section className="reveal">
        <SectionTitle note={events.length ? "urut dari yang terbaru" : undefined}>Airdrop yang ketemu</SectionTitle>
        {events.length === 0 ? (
          <div className="panel p-5 text-sm text-mute">
            Tidak ada airdrop yang terdeteksi di chain yang berhasil dipindai. Ini belum berarti wallet bersih —
            lihat cakupan scan di bawah untuk chain yang dilewati.
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((e) => (
              <article key={e.id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mono rounded-md border border-neon-dim/40 bg-neon/10 px-2 py-0.5 text-xs font-semibold text-neon">
                        {e.token.symbol}
                      </span>
                      {e.program ? <span className="text-sm font-medium text-white">{e.program}</span> : null}
                      <Badge tone={e.kind === "claim" ? "sky" : "violet"}>
                        {e.kind === "claim" ? "claim sendiri" : "masuk otomatis"}
                      </Badge>
                      <Badge tone={e.confidence === "registry" ? "profit" : "warn"}>
                        {e.confidence === "registry" ? "registry" : "tebakan"}
                      </Badge>
                      <Badge>{e.chainName}</Badge>
                    </div>
                    <div className="mono mt-2 text-lg text-white">
                      {fmtNum(e.amount, 6)} <span className="text-sm text-mute">{e.token.symbol}</span>
                    </div>
                    <div className="mt-1 text-xs text-mute">
                      {fmtDate(e.date)} · {e.token.name}
                      {e.held !== null && e.held > 0 ? (
                        <span className="text-profit"> · masih dipegang {fmtNum(e.held, 4)}</span>
                      ) : (
                        <span> · sudah keluar dari wallet</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-sm text-sky">{fmtUsd(e.usd)}</div>
                    <a
                      className="mono mt-1 inline-block text-[11px] text-mute hover:text-neon hover:underline"
                      href={e.explorerUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {short(e.txHash, 10, 8)} ↗
                    </a>
                  </div>
                </div>
                {e.note ? <p className="mt-3 border-t border-line pt-3 text-xs text-mute">{e.note}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Karantina spam */}
      {spam.length > 0 ? (
        <section className="reveal">
          <SectionTitle note="tidak dihitung sebagai airdrop">Karantina spam / phishing</SectionTitle>
          <details className="panel p-4">
            <summary className="cursor-pointer text-sm text-warn">
              {spam.length} token dikarantina — klik untuk lihat
            </summary>
            <div className="mt-3 space-y-2">
              {spam.map((s) => (
                <div key={s.id} className="panel-tight p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono text-xs font-semibold text-loss">{s.symbol}</span>
                    <Badge>{s.chainName}</Badge>
                    <span className="mono text-xs text-mute">{fmtNum(s.amount, 4)}</span>
                    <span className="text-xs text-mute">{fmtDate(s.date)}</span>
                  </div>
                  <p className="mt-1 text-xs text-mute">{s.name}</p>
                  <p className="mt-1 text-xs text-warn">{s.reason}</p>
                  <a
                    className="mono mt-1 inline-block break-all text-[11px] text-mute hover:text-neon hover:underline"
                    href={s.explorerUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {s.address} ↗
                  </a>
                </div>
              ))}
              <p className="text-xs text-mute">
                Jangan pernah membuka tautan dari token seperti ini dan jangan menandatangani apa pun untuk
                &ldquo;claim&rdquo; hadiah tak dikenal — itu pola drainer.
              </p>
            </div>
          </details>
        </section>
      ) : null}

      {/* Cakupan */}
      <section className="reveal">
        <SectionTitle note="kejujuran cakupan: chain yang dilewati tetap dilaporkan">Cakupan scan</SectionTitle>
        <div className="panel divide-y divide-line">
          {coverage.map((c) => (
            <div key={c.chainKey} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                <span className="text-sm text-white">{c.chainName}</span>
                {c.truncated ? <Badge tone="warn">dipotong</Badge> : null}
              </div>
              <div className="flex items-center gap-3 text-xs text-mute">
                {c.status === "scanned" || c.status === "partial" ? (
                  <span className="mono">{c.transfersScanned} transfer</span>
                ) : null}
                {c.reason ? <span className="max-w-[22rem] text-right">{c.reason}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Catatan */}
      {notes.length > 0 ? (
        <section className="reveal">
          <SectionTitle>Catatan metode</SectionTitle>
          <ul className="panel space-y-2 p-4 text-xs text-mute">
            {notes.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-neon">·</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
      <span className="text-xs uppercase tracking-wider text-mute">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}
