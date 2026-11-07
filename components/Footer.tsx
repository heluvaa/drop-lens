import { site } from "@/lib/content";
import { REGISTRY } from "@/lib/registry";
import { CHAINS } from "@/lib/chains";

export default function Footer() {
  const chains = CHAINS.length + 1;
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-mute">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            <span className="text-white">{site.name}</span> · data dari explorer publik, RPC publik, dan API harga.
            Read-only — tidak menandatangani transaksi apa pun.
          </p>
          <p className="mono">
            {chains} chain · {REGISTRY.length} airdrop terverifikasi
          </p>
        </div>
        <p className="mt-3">
          Registry airdrop diverifikasi on-chain (symbol/decimals di kontrak, mint dicek ke pasar). Entri yang gagal
          verifikasi dibuang, bukan ditampilkan. Coverage tidak lengkap bukan berarti wallet bersih.
        </p>
        {site.demo ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-md border border-warn/40 px-2 py-1 text-warn">
            DEMO — angka pada halaman contoh adalah data nyata dari chain, label contoh hanya di bagian tertentu.
          </p>
        ) : null}
      </div>
    </footer>
  );
}
