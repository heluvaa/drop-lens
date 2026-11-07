import { fetchJson, sleep } from "../http";
import type { CoverageStatus } from "../types";

const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
const BACKUP_RPC = "https://solana-rpc.publicnode.com";
const SPL = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export interface SolHolding {
  mint: string;
  tokenAccount: string;
  amount: number;
  decimals: number;
  program: "spl" | "token-2022";
}

export interface SolInbound {
  mint: string;
  amount: number;
  decimals: number;
  ts: number;
  txHash: string;
  from: string;
  walletInitiated: boolean;
  /** Cara deteksi: delta saldo di transaksi wallet, atau riwayat akun token mint registry. */
  via: "tx-delta" | "token-account";
}

export interface SolanaScan {
  chainKey: "solana";
  chainName: string;
  status: CoverageStatus;
  reason?: string;
  balanceSol: number | null;
  holdings: SolHolding[];
  inbound: SolInbound[];
  firstTs: number | null;
  lastTs: number | null;
  firstTx: { ts: number; hash: string } | null;
  lastTx: { ts: number; hash: string } | null;
  sigCount: number;
  /** Berapa signature yang benar-benar ditelusuri saat mencari transaksi paling awal. */
  sigWalked: number;
  /** true = batas halaman umur tercapai, jadi umur wallet adalah batas bawah. */
  ageTruncated: boolean;
  /** true = pemindaian dihentikan karena anggaran waktu, bukan karena data habis. */
  timeLimited: boolean;
  deep: boolean;
}

interface RpcCtx {
  endpoint: string;
  gap: number;
  keyed: boolean;
}

async function rpcOnce<T>(
  ctx: RpcCtx,
  endpoint: string,
  gap: number,
  method: string,
  params: unknown[],
  retries: number,
): Promise<T> {
  let lastErr: Error = new Error("rpc gagal");
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const j = await fetchJson<{ result?: T; error?: { message: string } }>(endpoint, {
        method: "POST",
        body: { jsonrpc: "2.0", id: 1, method, params },
        timeoutMs: 25000,
        retries: 0,
      });
      if (j.error) throw new Error(j.error.message);
      if (gap) await sleep(gap); // jeda anti rate-limit setelah panggilan sukses
      return j.result as T;
    } catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message.toLowerCase();
      const rateLimited = msg.includes("429") || msg.includes("too many") || msg.includes("rate");
      if (!rateLimited && !msg.includes("http 5")) break;
      await sleep(ctx.keyed ? 300 * (attempt + 1) : 900 * (attempt + 1));
    }
  }
  throw lastErr;
}

/** Panggilan RPC Solana dengan retry backoff + endpoint cadangan saat tanpa API key. */
async function rpc<T>(ctx: RpcCtx, method: string, params: unknown[], retries = 3): Promise<T> {
  try {
    return await rpcOnce<T>(ctx, ctx.endpoint, ctx.gap, method, params, retries);
  } catch (e) {
    if (!ctx.keyed && ctx.endpoint !== BACKUP_RPC) {
      return await rpcOnce<T>(ctx, BACKUP_RPC, 250, method, params, 1);
    }
    throw e;
  }
}

/** Ukuran batch JSON-RPC yang terverifikasi aman di RPC publik (batch 25 di-429). */
const BATCH = 5;

/**
 * Banyak panggilan dalam satu POST (JSON-RPC batch). Ini yang membuat pemindaian
 * transaksi Solana layak dipakai: 1 request per tx terlalu lambat tanpa API key.
 * Hasil dikembalikan sesuai urutan input; entri yang gagal jadi null.
 */
async function rpcMany<T>(ctx: RpcCtx, method: string, paramsList: unknown[][]): Promise<Array<T | null>> {
  const out: Array<T | null> = new Array(paramsList.length).fill(null);
  for (let i = 0; i < paramsList.length; i += BATCH) {
    const slice = paramsList.slice(i, i + BATCH);
    const body = slice.map((params, idx) => ({ jsonrpc: "2.0", id: idx, method, params }));
    try {
      const arr = await fetchJson<Array<{ id?: number; result?: T; error?: { message: string } }>>(ctx.endpoint, {
        method: "POST",
        body,
        timeoutMs: 30000,
        retries: 1,
        backoffMs: 700,
      });
      for (const item of arr ?? []) {
        const idx = typeof item.id === "number" ? item.id : -1;
        if (idx >= 0 && idx < slice.length && item.error === undefined) out[i + idx] = (item.result ?? null) as T | null;
      }
      if (ctx.gap) await sleep(ctx.gap);
    } catch {
      /* satu batch gagal → biarkan null, jangan gagalkan seluruh scan */
    }
  }
  return out;
}

interface SigInfo {
  signature: string;
  blockTime: number | null;
  err: unknown;
}

interface TokenBal {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount?: { amount: string; decimals: number; uiAmount: number | null };
}

interface TxParsed {
  blockTime?: number | null;
  transaction?: { message?: { accountKeys?: Array<{ pubkey?: string; signer?: boolean }> } };
  meta?: {
    err?: unknown;
    preTokenBalances?: TokenBal[];
    postTokenBalances?: TokenBal[];
    preBalances?: number[];
    postBalances?: number[];
  } | null;
}

/** Delta token milik `owner` pada satu transaksi (inbound = delta positif). */
function deltasFor(tx: TxParsed, owner: string): Array<{ mint: string; delta: number; decimals: number }> {
  const pre = new Map<number, number>();
  for (const b of tx.meta?.preTokenBalances ?? []) {
    if ((b.owner ?? "") !== owner) continue;
    pre.set(b.accountIndex, b.uiTokenAmount?.uiAmount ?? 0);
  }
  const out: Array<{ mint: string; delta: number; decimals: number }> = [];
  for (const b of tx.meta?.postTokenBalances ?? []) {
    if ((b.owner ?? "") !== owner) continue;
    const before = pre.get(b.accountIndex) ?? 0;
    const after = b.uiTokenAmount?.uiAmount ?? 0;
    const delta = after - before;
    if (delta !== 0) out.push({ mint: b.mint, delta, decimals: b.uiTokenAmount?.decimals ?? 0 });
  }
  return out;
}

export function solanaCtx(heliusKey?: string): RpcCtx {
  if (heliusKey) {
    return { endpoint: `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`, gap: 0, keyed: true };
  }
  return { endpoint: PUBLIC_RPC, gap: 180, keyed: false };
}

async function readHoldings(ctx: RpcCtx, owner: string): Promise<SolHolding[]> {
  const out: SolHolding[] = [];
  // Dua program wajib dicek: melewatkan Token-2022 berarti kehilangan seluruh token itu.
  for (const [program, label] of [
    [SPL, "spl"],
    [TOKEN_2022, "token-2022"],
  ] as const) {
    try {
      const r = await rpc<{
        value?: Array<{ pubkey: string; account: { data: { parsed?: { info?: Record<string, unknown> } } } }>;
      }>(ctx, "getTokenAccountsByOwner", [owner, { programId: program }, { encoding: "jsonParsed" }]);
      for (const item of r.value ?? []) {
        const info = item.account.data.parsed?.info as
          | { mint?: string; tokenAmount?: { uiAmount?: number | null; decimals?: number; amount?: string } }
          | undefined;
        const mint = info?.mint;
        const dec = info?.tokenAmount?.decimals ?? 0;
        const raw = info?.tokenAmount?.amount ?? "0";
        const amount = info?.tokenAmount?.uiAmount ?? Number(raw) / Math.pow(10, dec);
        if (mint && amount > 0) {
          out.push({ mint, tokenAccount: item.pubkey, amount, decimals: dec, program: label });
        }
      }
    } catch {
      /* program ini gagal — lanjut, jangan gagalkan seluruh scan */
    }
  }
  return out;
}

/**
 * Scan wallet Solana.
 *
 * `depth`     = jumlah signature terbaru yang dibuka satu per satu (1 request per tx).
 * `agePages`  = berapa halaman 1000 signature ditelusuri untuk mencari transaksi paling awal.
 * `budgetMs`  = anggaran waktu total. RPC publik Solana ketat rate limit, jadi urutan
 *               pengerjaannya sengaja dari yang termurah: registry dulu, umur wallet terakhir.
 */
export async function scanSolana(
  address: string,
  opts: {
    heliusKey?: string;
    depth?: number;
    agePages?: number;
    registryMints?: { mint: string; id: string }[];
    budgetMs?: number;
  },
): Promise<SolanaScan> {
  const ctx = solanaCtx(opts.heliusKey);
  const deadline = Date.now() + (opts.budgetMs ?? (ctx.keyed ? 120000 : 45000));
  const outOfTime = () => Date.now() > deadline;

  const res: SolanaScan = {
    chainKey: "solana",
    chainName: "Solana",
    status: "scanned",
    balanceSol: null,
    holdings: [],
    inbound: [],
    firstTs: null,
    lastTs: null,
    firstTx: null,
    lastTx: null,
    sigCount: 0,
    sigWalked: 0,
    ageTruncated: false,
    timeLimited: false,
    deep: ctx.keyed || (opts.depth ?? 0) > 120,
  };

  // 1. Saldo native.
  try {
    const b = await rpc<{ value: number }>(ctx, "getBalance", [address]);
    res.balanceSol = b.value / 1e9;
  } catch {
    res.status = "error";
    res.reason = "RPC Solana tidak menjawab";
    return res;
  }

  // 2. Holdings (dua program token).
  res.holdings = await readHoldings(ctx, address);

  // 3. Riwayat signature terbaru — murah (satu panggilan) dan memberi aktivitas terakhir.
  let sigs: SigInfo[] = [];
  try {
    sigs = await rpc<SigInfo[]>(ctx, "getSignaturesForAddress", [address, { limit: Math.max(opts.depth ?? 30, 20) }]);
  } catch {
    /* lanjut dengan daftar kosong */
  }
  res.sigCount = sigs.length;
  if (sigs.length && sigs[0].blockTime) {
    res.lastTs = sigs[0].blockTime;
    res.lastTx = { ts: sigs[0].blockTime, hash: sigs[0].signature };
  }

  const seen = new Set<string>();

  // 4. Jalur tepat sasaran: mint registry yang sedang dipegang wallet. Paling murah dan
  //    paling akurat (langsung memberi tanggal diterima), jadi dijalankan lebih dulu.
  const heldByMint = new Map(res.holdings.map((h) => [h.mint, h]));
  let targetBudget = 10;
  for (const rm of opts.registryMints ?? []) {
    if (targetBudget <= 0 || outOfTime()) {
      if (targetBudget <= 0) res.timeLimited = true;
      break;
    }
    const held = heldByMint.get(rm.mint);
    if (!held) continue;
    targetBudget--;
    try {
      const hist = await rpc<SigInfo[]>(ctx, "getSignaturesForAddress", [held.tokenAccount, { limit: 200 }]);
      if (!hist.length) continue;
      const first = hist[hist.length - 1];
      const tx = await rpc<TxParsed | null>(ctx, "getTransaction", [
        first.signature,
        { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" },
      ]).catch(() => null);
      const feePayer = tx?.transaction?.message?.accountKeys?.[0]?.pubkey ?? "";
      let amount = held.amount;
      let decimals = held.decimals;
      if (tx?.meta) {
        const d = deltasFor(tx, address).find((x) => x.mint === rm.mint && x.delta > 0);
        if (d) {
          amount = d.delta;
          decimals = d.decimals;
        }
      }
      const k = `${rm.mint}:${first.signature}`;
      if (seen.has(k)) continue;
      seen.add(k);
      res.inbound.push({
        mint: rm.mint,
        amount,
        decimals,
        ts: tx?.blockTime ?? first.blockTime ?? 0,
        txHash: first.signature,
        from: feePayer,
        walletInitiated: feePayer === address,
        via: "token-account",
      });
    } catch {
      /* jalur ini bonus, bukan syarat */
    }
  }

  // 5. Pemindaian transaksi terbaru untuk token MASUK yang tidak ada di registry.
  //    Dibatasi 5 panggilan per POST — ini bagian yang paling menentukan kecepatan.
  const pending = sigs.filter((s) => !s.err);
  for (let i = 0; i < pending.length; i += BATCH) {
    if (outOfTime()) {
      res.timeLimited = true;
      break;
    }
    const chunk = pending.slice(i, i + BATCH);
    const txs = await rpcMany<TxParsed>(ctx, "getTransaction", chunk.map((s) => [
      s.signature,
      { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" },
    ]));
    for (let j = 0; j < chunk.length; j++) {
      const s = chunk[j];
      const tx = txs[j];
      if (!tx?.meta) continue;
      // Bisa saja sudah ter-prune atau gagal → lewati, jangan simpulkan apa pun.
      const feePayer = tx.transaction?.message?.accountKeys?.[0]?.pubkey ?? "";
      for (const d of deltasFor(tx, address)) {
        if (d.delta <= 0) continue;
        const k = `${d.mint}:${s.signature}`;
        if (seen.has(k)) continue;
        seen.add(k);
        res.inbound.push({
          mint: d.mint,
          amount: d.delta,
          decimals: d.decimals,
          ts: tx.blockTime ?? s.blockTime ?? 0,
          txHash: s.signature,
          from: feePayer,
          walletInitiated: feePayer === address,
          via: "tx-delta",
        });
      }
    }
  }

  // 6. Umur wallet: jalur paling mahal (satu halaman = 1000 signature) → dijalankan terakhir.
  //    Kalau anggaran waktu habis di sini, hasil dari langkah 4-5 sudah aman.
  const agePages = ctx.keyed ? opts.agePages ?? 25 : Math.min(opts.agePages ?? 4, 4);
  let before = sigs.length ? sigs[sigs.length - 1].signature : undefined;
  for (let p = 0; p < agePages; p++) {
    if (outOfTime()) {
      res.timeLimited = true;
      break;
    }
    try {
      const page = await rpc<SigInfo[]>(ctx, "getSignaturesForAddress", [address, { limit: 1000, before }]);
      if (!page.length) break; // sudah sampai transaksi paling awal
      res.sigWalked += page.length;
      before = page[page.length - 1].signature;
      const last = page[page.length - 1];
      if (last.blockTime) {
        res.firstTs = last.blockTime;
        res.firstTx = { ts: last.blockTime, hash: last.signature };
      }
      if (p === agePages - 1) res.ageTruncated = true;
    } catch {
      res.ageTruncated = true;
      break;
    }
  }
  if (res.firstTs === null && sigs.length && sigs[sigs.length - 1].blockTime) {
    res.firstTs = sigs[sigs.length - 1].blockTime;
  }

  return res;
}

/** Ambil decimals sebuah mint (dipakai kalau nilai token perlu dihitung manual). */
export async function mintDecimals(heliusKey: string | undefined, mint: string): Promise<number | null> {
  const ctx = solanaCtx(heliusKey);
  try {
    const r = await rpc<{ value?: { data?: { parsed?: { info?: { decimals?: number } } } } }>(ctx, "getAccountInfo", [
      mint,
      { encoding: "jsonParsed" },
    ]);
    return r.value?.data?.parsed?.info?.decimals ?? null;
  } catch {
    return null;
  }
}
