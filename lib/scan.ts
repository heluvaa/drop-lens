import { CHAINS, CHAIN_BY_KEY, CORE_EVM, SOLANA_CHAIN } from "./chains";
import { REGISTRY } from "./registry";
import {
  coverageFromEVM,
  coverageFromSolana,
  detectEVM,
  detectSolana,
  MIN_LIQ_USD,
  needsMarketCheck,
  type Detected,
} from "./detect";
import { nativeBalance, probeContracts, refineClaimKind, scanBlockscout, scanEtherscanLike } from "./providers/evm";
import { scanSolana, type SolHolding } from "./providers/solana";
import { emptyChainScan, type ChainScan } from "./raw";
import { fetchJson, mapLimit } from "./http";
import type {
  AirdropEvent,
  AddrKind,
  ChainCoverage,
  NativeBalance,
  ScanReport,
  WalletProfile,
} from "./types";

// ---------------- Validasi alamat ----------------

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const B58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface Validated {
  ok: boolean;
  kind?: AddrKind;
  address?: string;
  error?: string;
}

export function validateAddress(input: string): Validated {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Alamat kosong." };
  if (raw.length > 100) return { ok: false, error: "Alamat terlalu panjang." };
  if (EVM_RE.test(raw)) return { ok: true, kind: "evm", address: raw };
  if (/^0x/i.test(raw)) return { ok: false, error: "Alamat EVM harus 0x + 40 karakter hex." };
  if (raw.length >= 80) {
    return { ok: false, error: "Itu kelihatan seperti signature transaksi, bukan alamat wallet." };
  }
  if (B58_RE.test(raw) && !/^[0-9]+$/.test(raw)) {
    return { ok: true, kind: "solana", address: raw };
  }
  return { ok: false, error: "Format alamat tidak dikenali (bukan 0x... maupun base58 Solana)." };
}

// ---------------- Harga ----------------

const CG: Record<string, string> = {
  ethereum: "ethereum",
  arbitrum: "ethereum",
  base: "ethereum",
  optimism: "ethereum",
  zksync: "ethereum",
  linea: "ethereum",
  scroll: "ethereum",
  blast: "ethereum",
  mode: "ethereum",
  zora: "ethereum",
  unichain: "ethereum",
  worldchain: "ethereum",
  ink: "ethereum",
  taiko: "ethereum",
  "polygon-zkevm": "ethereum",
  polygon: "matic-network",
  bnb: "binancecoin",
  celo: "celo",
  gnosis: "xdai",
  mantle: "mantle",
  berachain: "berachain",
  avalanche: "avalanche-2",
  apechain: "apecoin",
  rootstock: "rootstock",
  sei: "sei-network",
  sonic: "sonic-3",
  solana: "solana",
};

async function nativePrices(): Promise<Record<string, number>> {
  const ids = [...new Set(Object.values(CG))];
  try {
    const j = await fetchJson<{ coins?: Record<string, { price?: number }> }>(
      `https://coins.llama.fi/prices/current/${ids.map((i) => `coingecko:${i}`).join(",")}?searchWidth=4h`,
      { retries: 1, timeoutMs: 12000 },
    );
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(j.coins ?? {})) {
      const id = k.replace("coingecko:", "");
      if (v?.price) out[id] = v.price;
    }
    return out;
  } catch {
    return {};
  }
}

export interface TokenMeta {
  symbol: string;
  name: string;
  decimals: number;
  usd: number | null;
  /** Likuiditas pool terbesar (USD) dari DexScreener — dasar saringan "tebakan". */
  liq: number;
}

/** DexScreener: chainId → chainKey kita (untuk memastikan alamat dicek di chain yang benar). */
const DEX_CHAIN: Record<string, string> = {
  ethereum: "ethereum",
  arbitrum: "arbitrum",
  base: "base",
  optimism: "optimism",
  polygon: "polygon",
  bnb: "bsc",
  zksync: "zksync",
  linea: "linea",
  scroll: "scroll",
  mantle: "mantle",
  blast: "blast",
  mode: "mode",
  zora: "zora",
  celo: "celo",
  gnosis: "gnosis",
  unichain: "unichain",
  worldchain: "worldchain",
  ink: "ink",
  berachain: "berachain",
  avalanche: "avalanche",
  apechain: "apechain",
  rootstock: "rootstock",
  taiko: "taiko",
  sei: "sei",
  sonic: "sonic",
  "polygon-zkevm": "polygon-zkevm",
};

/** Likuiditas pool terbesar per alamat (dipakai sebagai saringan pasar). */
async function dexLiquidity(addresses: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()))].slice(0, 90);
  for (let i = 0; i < uniq.length; i += 30) {
    const chunk = uniq.slice(i, i + 30);
    try {
      const j = await fetchJson<{
        pairs?: Array<{
          chainId?: string;
          baseToken?: { address?: string };
          liquidity?: { usd?: number };
        }> | null;
      }>(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`, { retries: 1, timeoutMs: 12000 });
      for (const p of j.pairs ?? []) {
        const addr = (p.baseToken?.address ?? "").toLowerCase();
        if (!addr) continue;
        const liq = p.liquidity?.usd ?? 0;
        if (p.chainId) {
          const k = `${p.chainId}|${addr}`;
          out.set(k, Math.max(out.get(k) ?? 0, liq));
        }
        out.set(addr, Math.max(out.get(addr) ?? 0, liq));
      }
    } catch {
      /* lewati chunk yang gagal — token tanpa data pasar otomatis tidak lolos saringan */
    }
  }
  return out;
}

/** Metadata + harga + likuiditas mint Solana via DexScreener (batch 30 mint per panggilan). */
async function solTokenMeta(mints: string[]): Promise<Map<string, TokenMeta>> {
  const out = new Map<string, TokenMeta>();
  const uniq = [...new Set(mints)].slice(0, 90);
  for (let i = 0; i < uniq.length; i += 30) {
    const chunk = uniq.slice(i, i + 30);
    try {
      const j = await fetchJson<{
        pairs?: Array<{
          baseToken?: { address?: string; symbol?: string; name?: string };
          priceUsd?: string;
          liquidity?: { usd?: number };
        }> | null;
      }>(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`, { retries: 1, timeoutMs: 12000 });
      for (const p of j.pairs ?? []) {
        const addr = p.baseToken?.address;
        if (!addr) continue;
        const prev = out.get(addr);
        const price = p.priceUsd ? Number(p.priceUsd) : null;
        const liq = p.liquidity?.usd ?? 0;
        if (!prev || liq > prev.liq) {
          out.set(addr, {
            symbol: p.baseToken?.symbol ?? "???",
            name: p.baseToken?.name ?? "Token tanpa nama",
            decimals: prev?.decimals ?? 0,
            usd: price,
            liq,
          });
        }
      }
    } catch {
      /* lewati chunk yang gagal */
    }
  }
  return out;
}

// ---------------- Cache in-memory ----------------

const CACHE = new Map<string, { at: number; report: ScanReport }>();
const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 120;

export interface ScanOptions {
  chains?: string[];
  solanaDepth?: number;
  maxConcurrent?: number;
}

export async function scanAddress(address: string, opts: ScanOptions = {}): Promise<ScanReport> {
  const t0 = Date.now();
  const v = validateAddress(address);
  if (!v.ok) throw Object.assign(new Error(v.error), { status: 400 });
  const kind = v.kind!;
  const addr = v.address!;

  const etherscanKey = process.env.ETHERSCAN_API_KEY?.trim() || "";
  const heliusKey = process.env.HELIUS_API_KEY?.trim() || "";

  const key = `${kind}:${addr}:${(opts.chains ?? []).join(",")}:${opts.solanaDepth ?? ""}:${!!etherscanKey}:${!!heliusKey}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { ...hit.report, elapsedMs: Date.now() - t0 };
  }

  const prices = await nativePrices();

  let events: AirdropEvent[] = [];
  let spam: Detected["spam"] = [];
  const coverage: ChainCoverage[] = [];
  const native: NativeBalance[] = [];
  let profile: WalletProfile;

  if (kind === "evm") {
    const wanted = new Set(opts.chains?.length ? opts.chains : CORE_EVM.map((c) => c.key));
    const list = CHAINS.filter((c) => wanted.has(c.key));

    const solKinds: ChainScan[] = await mapLimit(list, opts.maxConcurrent ?? 6, async (chain) => {
      if (chain.bs) {
        try {
          return await scanBlockscout(chain, addr, { maxTransferPages: 2, maxTxPages: 1 });
        } catch (e) {
          return emptyChainScan(chain.key, chain.name, chain.native, "error", (e as Error).message.slice(0, 80));
        }
      }
      if (chain.rs) {
        try {
          return await scanEtherscanLike(chain, addr, { apiBase: chain.rs, maxTransferPages: 2, maxTxPages: 1 });
        } catch (e) {
          return emptyChainScan(chain.key, chain.name, chain.native, "error", (e as Error).message.slice(0, 80));
        }
      }
      if (chain.es && etherscanKey) {
        try {
          return await scanEtherscanLike(chain, addr, {
            apiBase: `https://api.etherscan.io/v2/api`,
            apiKey: etherscanKey,
            maxTransferPages: 2,
            maxTxPages: 1,
          });
        } catch (e) {
          return emptyChainScan(chain.key, chain.name, chain.native, "error", (e as Error).message.slice(0, 80));
        }
      }
      return emptyChainScan(
        chain.key,
        chain.name,
        chain.native,
        "skipped",
        chain.bsBlocked
          ? "explorer publik diblokir Cloudflare — butuh API key Etherscan (gratis)"
          : "butuh API key Etherscan (gratis)",
      );
    });

    // Verifikasi claim vs push, lalu lengkapi flag kontrak untuk chain Etherscan.
    await mapLimit(solKinds, 3, async (cs) => {
      const chain = CHAIN_BY_KEY[cs.chainKey];
      if (!chain) return;
      const a = addr.toLowerCase();

      // Sender transaksi sebenarnya — explorer hanya memberi jendela terbaru,
      // jadi claim lama bisa salah terbaca sebagai push.
      await refineClaimKind(cs.chainKey, cs.transfers, addr).catch(() => undefined);

      // Chain Etherscan tidak memberi flag is_contract → probe eth_getCode.
      if (!chain.es) return;
      const unknown = cs.transfers
        .filter((t) => t.direction === "in" && t.fromIsContract === null && t.from !== a)
        .map((t) => t.from);
      if (!unknown.length) return;
      const map = await probeContracts(cs.chainKey, unknown);
      for (const t of cs.transfers) {
        if (t.fromIsContract === null && map.has(t.from)) t.fromIsContract = map.get(t.from)!;
      }
    });

    // Saringan pasar untuk event "tebakan": token harus punya pool nyata. Tanpa ini,
    // wallet sibuk dibanjiri token spam yang kebetulan juga dikirim dari kontrak.
    const candAddrs: string[] = [];
    for (const cs of solKinds) {
      for (const t of cs.transfers) {
        if (t.direction !== "in") continue;
        if (needsMarketCheck(cs.chainKey, t.token)) candAddrs.push(t.token.address);
      }
    }
    const market = candAddrs.length ? await dexLiquidity(candAddrs) : new Map<string, number>();
    const hasMarket = (chainKey: string, tokenAddress: string) => {
      const a = tokenAddress.toLowerCase();
      const id = DEX_CHAIN[chainKey];
      if (id) {
        const v = market.get(`${id}|${a}`);
        if (v !== undefined) return v >= MIN_LIQ_USD;
      }
      const v2 = market.get(a);
      return v2 !== undefined && v2 >= MIN_LIQ_USD;
    };

    const det = detectEVM(solKinds, addr, hasMarket);
    events = det.events;
    spam = det.spam;
    coverage.push(...coverageFromEVM(solKinds));

    for (const cs of solKinds) {
      if (cs.nativeBalance !== null && cs.nativeBalance > 0) {
        const id = CG[cs.chainKey];
        const rate = id ? prices[id] ?? null : null;
        native.push({
          chainKey: cs.chainKey,
          chainName: cs.chainName,
          symbol: cs.nativeSymbol,
          balance: cs.nativeBalance,
          usd: rate ? cs.nativeBalance * rate : null,
        });
      }
    }

    const withActivity = solKinds.filter((c) => c.lastTs !== null || c.firstTx !== null);
    let first: { chainKey: string; ts: number; hash: string } | null = null;
    let last: { chainKey: string; ts: number; hash: string } | null = null;
    for (const c of solKinds) {
      if (c.firstTx && (!first || c.firstTx.ts < first.ts)) {
        first = { chainKey: c.chainKey, ts: c.firstTx.ts, hash: c.firstTx.hash };
      }
      if (c.lastTs && (!last || c.lastTs > last.ts)) {
        last = { chainKey: c.chainKey, ts: c.lastTs, hash: c.lastTx?.hash ?? "" };
      }
    }
    const primary = solKinds.find((c) => c.chainKey === "ethereum") ?? solKinds[0];
    profile = {
      address: addr,
      kind: "evm",
      label: primary?.label ?? null,
      isContract: primary?.isContract ?? null,
      proxyType: primary?.proxyType ?? null,
      firstActivity: first
        ? {
            chainKey: first.chainKey,
            chainName: CHAIN_BY_KEY[first.chainKey]?.name ?? first.chainKey,
            ts: first.ts,
            date: new Date(first.ts * 1000).toISOString(),
            txHash: first.hash,
            explorerUrl: `${CHAIN_BY_KEY[first.chainKey]?.explorer ?? ""}/tx/${first.hash}`,
          }
        : null,
      lastActivity: last
        ? {
            chainKey: last.chainKey,
            chainName: CHAIN_BY_KEY[last.chainKey]?.name ?? last.chainKey,
            ts: last.ts,
            date: new Date(last.ts * 1000).toISOString(),
            txHash: last.hash,
            explorerUrl: `${CHAIN_BY_KEY[last.chainKey]?.explorer ?? ""}/tx/${last.hash}`,
          }
        : null,
      ageDays: first ? Math.floor((Date.now() / 1000 - first.ts) / 86400) : null,
      txCount: solKinds.reduce((s, c) => s + (c.txCount ?? 0), 0) || null,
      transferCount: solKinds.reduce((s, c) => s + (c.transferCount ?? 0), 0) || null,
      chainsActive: withActivity.length,
      native,
    };
  } else {
    // ---------------- Solana ----------------
    const registryMints = REGISTRY.filter((r) => r.chain === "solana").map((r) => ({ mint: r.token, id: r.id }));
    const sol = await scanSolana(addr, {
      heliusKey: heliusKey || undefined,
      // Batch JSON-RPC membuat jumlah tx relatif murah; 60 transaksi terbaru
      // memberi cakupan bagus tanpa membuat laporan lambat.
      depth: opts.solanaDepth ?? (heliusKey ? 400 : 60),
      agePages: heliusKey ? 25 : 4,
      registryMints,
    }).catch(() => null);

    const holdings: SolHolding[] = sol?.holdings ?? [];
    const mints = [...new Set([...(sol?.inbound ?? []).map((i) => i.mint), ...holdings.map((h) => h.mint)])];
    const meta = await solTokenMeta(mints);

    // Lengkapi decimals dari holdings (DexScreener tidak memberi decimals).
    for (const h of holdings) {
      const m = meta.get(h.mint);
      if (m) m.decimals = h.decimals;
    }

    const det = detectSolana(sol, holdings, (mint) => meta.get(mint) ?? null);
    events = det.events;
    spam = det.spam;
    coverage.push(coverageFromSolana(sol));

    if (sol?.balanceSol) {
      const rate = prices["solana"] ?? null;
      native.push({
        chainKey: "solana",
        chainName: "Solana",
        symbol: "SOL",
        balance: sol.balanceSol,
        usd: rate ? sol.balanceSol * rate : null,
      });
    }

    profile = {
      address: addr,
      kind: "solana",
      label: null,
      isContract: null,
      proxyType: null,
      firstActivity:
        sol?.firstTx && sol.firstTx.ts
          ? {
              chainKey: "solana",
              chainName: "Solana",
              ts: sol.firstTx.ts,
              date: new Date(sol.firstTx.ts * 1000).toISOString(),
              txHash: sol.firstTx.hash,
              explorerUrl: `https://solscan.io/tx/${sol.firstTx.hash}`,
            }
          : null,
      lastActivity:
        sol?.lastTx
          ? {
              chainKey: "solana",
              chainName: "Solana",
              ts: sol.lastTx.ts,
              date: new Date(sol.lastTx.ts * 1000).toISOString(),
              txHash: sol.lastTx.hash,
              explorerUrl: `https://solscan.io/tx/${sol.lastTx.hash}`,
            }
          : null,
      ageDays: sol?.firstTs ? Math.floor((Date.now() / 1000 - sol.firstTs) / 86400) : null,
      txCount: sol?.sigCount ?? null,
      transferCount: sol?.inbound.length ?? null,
      chainsActive: sol ? 1 : 0,
      native,
    };
  }

  events.sort((a, b) => b.ts - a.ts);
  const claims = events.filter((e) => e.kind === "claim").length;
  const withUsd = events.filter((e) => e.usd !== null);
  const usdTotal = withUsd.length ? withUsd.reduce((s, e) => s + (e.usd ?? 0), 0) : null;

  const notes: string[] = [];
  const skipped = coverage.filter((c) => c.status === "skipped");
  if (skipped.length) {
    notes.push(
      `${skipped.length} chain dilewati: ${skipped.map((c) => c.chainName).join(", ")}. ` +
        (etherscanKey
          ? "API key Etherscan terpasang tapi chain ini tetap gagal — cek kuota/key."
          : "Pasang ETHERSCAN_API_KEY (gratis) untuk membuka chain-chain ini."),
    );
  }
  if (coverage.some((c) => c.kind === "evm" && c.truncated)) {
    notes.push("Sebagian chain EVM dipotong pada batas halaman — wallet dengan riwayat sangat panjang bisa punya event di luar jendela yang dipindai.");
  }
  if (events.some((e) => e.confidence === "heuristic")) {
    notes.push(
      "Event berlabel 'tebakan' bukan hasil cocok registry: token masuk dari kontrak, wallet tidak pernah mengirim token itu, dan tokennya punya pasar nyata (likuiditas ≥ $5.000). Ciri airdrop — tapi bukan konfirmasi.",
    );
  }
  if (spam.length) {
    notes.push(`${spam.length} token dikarantina sebagai spam/phishing dan TIDAK dihitung sebagai airdrop.`);
  }
  if (kind === "solana" && !heliusKey) {
    notes.push("Solana tanpa HELIUS_API_KEY: riwayat dibatasi transaksi terbaru dan dijeda agar tidak kena rate limit RPC publik.");
  }
  if (kind === "solana") {
    notes.push(
      "Untuk airdrop Solana yang ketemu lewat akun token, jumlah yang ditampilkan = saldo terkini token itu (angka pasti), dan tanggalnya = penerimaan paling awal yang terbaca. Total yang pernah diterima bisa lebih besar kalau sebagian sudah dijual.",
    );
  }
  notes.push("Nilai USD memakai kurs saat scan, bukan harga saat airdrop jatuh — anggap estimasi.");

  const report: ScanReport = {
    ok: true,
    address: addr,
    kind,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    profile,
    events,
    spam,
    coverage,
    totals: {
      events: events.length,
      claims,
      pushes: events.length - claims,
      usd: usdTotal,
      usdCovered: withUsd.length,
      chainsWithEvents: new Set(events.map((e) => e.chainKey)).size,
      spamCount: spam.length,
    },
    notes,
    keys: { etherscan: !!etherscanKey, helius: !!heliusKey },
  };

  if (CACHE.size >= MAX_CACHE) {
    const oldest = [...CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) CACHE.delete(oldest[0]);
  }
  CACHE.set(key, { at: Date.now(), report });
  return report;
}

export const SUPPORTED_EVM_COUNT = CHAINS.length;
export const SOLANA = SOLANA_CHAIN;
