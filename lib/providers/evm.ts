import { fetchJson, mapLimit, hexOrDecToBigStr, toNum } from "../http";
import type { ChainDef } from "../types";
import { emptyChainScan, type ChainScan, type RawTransfer, type RawTx } from "../raw";

// ---------------- RPC publik per chain (untuk eth_getCode / eth_getBalance) ----------------

export const RPC: Record<string, string[]> = {
  ethereum: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"],
  arbitrum: ["https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org"],
  base: ["https://base-rpc.publicnode.com", "https://base.drpc.org"],
  optimism: ["https://optimism-rpc.publicnode.com", "https://optimism.drpc.org"],
  polygon: ["https://polygon-bor-rpc.publicnode.com"],
  bnb: ["https://bsc-rpc.publicnode.com"],
  zksync: ["https://mainnet.era.zksync.io", "https://zksync.drpc.org"],
  linea: ["https://linea-rpc.publicnode.com"],
  scroll: ["https://scroll-rpc.publicnode.com"],
  mantle: ["https://mantle-rpc.publicnode.com"],
  blast: ["https://blast.drpc.org"],
  mode: ["https://mainnet.mode.network", "https://mode.drpc.org"],
  zora: ["https://rpc.zora.energy", "https://zora.drpc.org"],
  celo: ["https://celo-rpc.publicnode.com"],
  gnosis: ["https://gnosis-rpc.publicnode.com"],
  unichain: ["https://unichain-rpc.publicnode.com"],
  worldchain: ["https://worldchain-mainnet.g.alchemy.com/public"],
  ink: ["https://rpc-qnd.inkonchain.com"],
  berachain: ["https://berachain-rpc.publicnode.com"],
  avalanche: ["https://avalanche-c-chain-rpc.publicnode.com"],
  apechain: ["https://rpc.apechain.com", "https://apechain.calderachain.xyz/http"],
  rootstock: ["https://public-node.rsk.co", "https://mycrypto.rsk.co"],
  taiko: ["https://taiko-rpc.publicnode.com"],
  sei: ["https://sei-evm-rpc.publicnode.com"],
  sonic: ["https://sonic-rpc.publicnode.com"],
  "polygon-zkevm": ["https://zkevm-rpc.com", "https://polygon-zkevm.drpc.org"],
};

let rpcErr = "";
export async function rpcCall(chain: string, method: string, params: unknown[]): Promise<unknown> {
  for (const url of RPC[chain] ?? RPC.ethereum) {
    try {
      const j = await fetchJson<{ result?: unknown; error?: { message: string } }>(url, {
        method: "POST",
        body: { jsonrpc: "2.0", id: 1, method, params },
        timeoutMs: 15000,
        retries: 0,
      });
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) {
      rpcErr = (e as Error).message;
    }
  }
  throw new Error(rpcErr || "rpc gagal");
}
const rpc = rpcCall;

/**
 * Tentukan dengan pasti apakah tiap transfer MASUK dipicu wallet sendiri (= claim).
 * Provider explorer hanya memberi jendela transaksi terbaru, jadi klaim lama bisa
 * salah terbaca sebagai "push". eth_getTransactionByHash memberi sender sebenarnya.
 */
export async function refineClaimKind(chainKey: string, transfers: RawTransfer[], wallet: string): Promise<void> {
  const a = wallet.toLowerCase();
  if (!RPC[chainKey]) return;
  const unknown = transfers.filter((t) => t.direction === "in" && !t.walletInitiated && t.txHash).slice(0, 40);
  if (!unknown.length) return;
  const sender = new Map<string, string>();
  await mapLimit(unknown, 5, async (t) => {
    if (sender.has(t.txHash)) return;
    try {
      const tx = (await rpcCall(chainKey, "eth_getTransactionByHash", [t.txHash])) as { from?: string } | null;
      if (tx?.from) sender.set(t.txHash, tx.from.toLowerCase());
    } catch {
      /* biarkan tidak diketahui — jangan menebak */
    }
  });
  for (const t of transfers) {
    const from = sender.get(t.txHash);
    if (from !== undefined) t.walletInitiated = from === a;
  }
}

/**
 * Cek apakah tiap alamat adalah kontrak (eth_getCode). Dipakai untuk menebak
 * apakah pengirim sebuah transfer adalah distributor airdrop atau wallet biasa,
 * khususnya di chain Etherscan yang tidak memberi flag is_contract.
 */
export async function probeContracts(chain: string, addrs: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const uniq = [...new Set(addrs.map((a) => a.toLowerCase()))].slice(0, 30);
  await mapLimit(uniq, 5, async (a) => {
    try {
      const code = (await rpc(chain, "eth_getCode", [a, "latest"])) as string;
      out.set(a, !!code && code !== "0x" && code.length > 2);
    } catch {
      /* biarkan tidak diketahui */
    }
  });
  return out;
}

export async function nativeBalance(chain: string, address: string): Promise<number | null> {
  try {
    const hex = (await rpc(chain, "eth_getBalance", [address, "latest"])) as string;
    return Number(BigInt(hexOrDecToBigStr(hex))) / 1e18;
  } catch {
    return null;
  }
}

// ---------------- Blockscout (tanpa API key) ----------------

interface BsToken {
  address_hash?: string;
  symbol?: string | null;
  name?: string | null;
  decimals?: string | number | null;
  exchange_rate?: string | number | null;
}
interface BsItem {
  from?: { hash?: string; is_contract?: boolean } | null;
  to?: { hash?: string; is_contract?: boolean } | null;
  token?: BsToken | null;
  total?: { value?: string; decimals?: string | number | null } | null;
  timestamp?: string;
  transaction_hash?: string;
  hash?: string;
  method?: string | null;
}
interface BsPage {
  items?: BsItem[];
  next_page_params?: Record<string, string | number | null> | null;
}

function qs(base: string, params: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

export async function scanBlockscout(
  chain: ChainDef,
  address: string,
  opts: { maxTransferPages?: number; maxTxPages?: number },
): Promise<ChainScan> {
  const out = emptyChainScan(chain.key, chain.name, chain.native);
  const bs = chain.bs!;
  const a = address.toLowerCase();
  const maxT = opts.maxTransferPages ?? 2;
  const maxX = opts.maxTxPages ?? 1;

  // Profil + counter + tx pertama (v1, sort=asc) — paralel.
  const [info, counters, firstTx] = await Promise.all([
    fetchJson<Record<string, unknown>>(`${bs}/api/v2/addresses/${a}`, { retries: 1 }).catch(() => null),
    fetchJson<Record<string, string>>(`${bs}/api/v2/addresses/${a}/counters`, { retries: 1 }).catch(() => null),
    chain.v1
      ? fetchJson<{ result?: Array<{ timeStamp?: string; hash?: string }> }>(
          qs(`${bs}/api`, { module: "account", action: "txlist", address: a, sort: "asc", page: 1, offset: 1 }),
          { retries: 1 },
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (info) {
    out.label = (info.ens_domain_name as string) || null;
    out.isContract = (info.is_contract as boolean) ?? null;
    out.proxyType = (info.proxy_type as string) ?? null;
    const cb = info.coin_balance as string | undefined;
    if (cb) out.nativeBalance = Number(BigInt(hexOrDecToBigStr(cb))) / 1e18;
  }
  if (counters) {
    out.txCount = counters.transactions_count ? toNum(counters.transactions_count) : null;
    out.transferCount = counters.token_transfers_count ? toNum(counters.token_transfers_count) : null;
  }
  const ft = firstTx?.result?.[0];
  if (ft?.timeStamp && ft.hash) {
    out.firstTx = { ts: toNum(ft.timeStamp), hash: ft.hash };
  }

  // Transaksi yang di-initiate wallet (dipakai untuk menandai "claim").
  const initiated = new Set<string>();
  let page: Record<string, string | number | null> | null = null;
  for (let p = 0; p < maxX; p++) {
    const data: BsPage = await fetchJson<BsPage>(
      qs(`${bs}/api/v2/addresses/${a}/transactions`, page ?? {}),
      { retries: 1 },
    ).catch(() => ({ items: [] }));
    for (const it of data.items ?? []) {
      const from = it.from?.hash?.toLowerCase();
      const ts = it.timestamp ? Date.parse(it.timestamp) / 1000 : 0;
      const to = it.to?.hash?.toLowerCase() ?? "";
      if (from === a && it.hash) {
        initiated.add(it.hash);
        out.txs.push({ hash: it.hash, to, ts, method: it.method ?? null });
      }
      if (ts && (out.lastTs === null || ts > out.lastTs)) {
        out.lastTs = ts;
        out.lastTx = { ts, hash: it.hash ?? "" };
      }
    }
    page = (data.next_page_params as Record<string, string | number | null>) ?? null;
    if (!page) break;
    if (p === maxX - 1) out.truncated = true;
  }

  // Transfer ERC-20.
  page = null;
  for (let p = 0; p < maxT; p++) {
    const data: BsPage = await fetchJson<BsPage>(
      qs(`${bs}/api/v2/addresses/${a}/token-transfers`, { type: "ERC-20", ...(page ?? {}) }),
      { retries: 1 },
    ).catch(() => ({ items: [] }));
    for (const it of data.items ?? []) {
      const t = it.token;
      if (!t?.address_hash || (!t.symbol && !t.name)) continue;
      const decimals = toNum(t.decimals, 18);
      const raw = it.total?.value ?? "0";
      const from = it.from?.hash?.toLowerCase() ?? "";
      const to = it.to?.hash?.toLowerCase() ?? "";
      const ts = it.timestamp ? Date.parse(it.timestamp) / 1000 : 0;
      out.transfers.push({
        token: {
          address: t.address_hash,
          symbol: t.symbol || "???",
          name: t.name || t.symbol || "Unknown",
          decimals,
        },
        from,
        to,
        fromIsContract: it.from?.is_contract ?? null,
        amount: Number(BigInt(hexOrDecToBigStr(raw))) / Math.pow(10, decimals),
        amountRaw: raw,
        ts,
        txHash: it.transaction_hash ?? "",
        direction: to === a ? "in" : "out",
        walletInitiated: initiated.has(it.transaction_hash ?? ""),
        usdRate: t.exchange_rate != null ? toNum(t.exchange_rate, NaN) || null : null,
      });
      if (ts && (out.lastTs === null || ts > out.lastTs)) {
        out.lastTs = ts;
        out.lastTx = { ts, hash: it.transaction_hash ?? "" };
      }
    }
    page = (data.next_page_params as Record<string, string | number | null>) ?? null;
    if (!page) break;
    if (p === maxT - 1) out.truncated = true;
  }

  out.scanned = out.transfers.length;
  return out;
}

// ---------------- Etherscan-compatible (Etherscan V2 dengan key, atau Routescan tanpa key) ----------------

interface EsTx {
  hash?: string;
  from?: string;
  to?: string;
  contractAddress?: string;
  tokenSymbol?: string;
  tokenName?: string;
  tokenDecimal?: string;
  value?: string;
  timeStamp?: string;
  methodId?: string;
  functionName?: string;
}

export async function scanEtherscanLike(
  chain: ChainDef,
  address: string,
  opts: { apiBase: string; apiKey?: string; maxTransferPages?: number; maxTxPages?: number },
): Promise<ChainScan> {
  const out = emptyChainScan(chain.key, chain.name, chain.native);
  const a = address;
  const al = address.toLowerCase();
  const keyParam = opts.apiKey ? { apikey: opts.apiKey } : {};
  const maxT = opts.maxTransferPages ?? 2;
  const maxX = opts.maxTxPages ?? 1;

  const call = async (params: Record<string, string | number>) =>
    fetchJson<{ status?: string; message?: string; result?: unknown }>(
      qs(opts.apiBase, { ...params, ...keyParam }),
      { retries: 1 },
    );

  // Tx pertama (sort=asc) — sekaligus jadi tes apakah key/endpoint berfungsi.
  const asc = await call({ module: "account", action: "txlist", address: a, sort: "asc", page: 1, offset: 1 }).catch(
    (e) => ({ status: "0", message: (e as Error).message, result: [] as unknown }),
  );
  if (asc.status !== "1" && /api key/i.test(asc.message ?? "")) {
    out.status = "skipped";
    out.reason = "butuh API key Etherscan (gratis)";
    return out;
  }
  if (asc.status === "1" && Array.isArray(asc.result) && asc.result.length) {
    const t = asc.result[0] as EsTx;
    if (t.timeStamp) out.firstTx = { ts: toNum(t.timeStamp), hash: t.hash ?? "" };
  }

  // Tx terbaru + set tx yang di-initiate wallet.
  const initiated = new Set<string>();
  for (let p = 1; p <= maxX; p++) {
    const d = await call({ module: "account", action: "txlist", address: a, sort: "desc", page: p, offset: 100 }).catch(
      () => ({ status: "0", message: "", result: [] as unknown }),
    );
    if (d.status !== "1" || !Array.isArray(d.result)) break;
    if (d.result.length === 0) break;
    for (const t of d.result as EsTx[]) {
      const ts = toNum(t.timeStamp);
      const from = (t.from ?? "").toLowerCase();
      if (from === al && t.hash) {
        initiated.add(t.hash);
        out.txs.push({ hash: t.hash, to: (t.to ?? "").toLowerCase(), ts, method: t.methodId ?? null });
      }
      if (ts && (out.lastTs === null || ts > out.lastTs)) {
        out.lastTs = ts;
        out.lastTx = { ts, hash: t.hash ?? "" };
      }
    }
    if (d.result.length < 100) break;
    if (p === maxX) out.truncated = true;
  }

  // Transfer ERC-20.
  for (let p = 1; p <= maxT; p++) {
    const d = await call({ module: "account", action: "tokentx", address: a, sort: "desc", page: p, offset: 100 }).catch(
      () => ({ status: "0", message: "", result: [] as unknown }),
    );
    if (d.status !== "1" || !Array.isArray(d.result)) break;
    if (d.result.length === 0) break;
    for (const t of d.result as EsTx[]) {
      if (!t.contractAddress) continue;
      const decimals = toNum(t.tokenDecimal, 18);
      const raw = t.value ?? "0";
      const from = (t.from ?? "").toLowerCase();
      const to = (t.to ?? "").toLowerCase();
      const ts = toNum(t.timeStamp);
      out.transfers.push({
        token: {
          address: t.contractAddress,
          symbol: t.tokenSymbol || "???",
          name: t.tokenName || t.tokenSymbol || "Unknown",
          decimals,
        },
        from,
        to,
        fromIsContract: null,
        amount: Number(BigInt(hexOrDecToBigStr(raw))) / Math.pow(10, decimals),
        amountRaw: raw,
        ts,
        txHash: t.hash ?? "",
        direction: to === al ? "in" : "out",
        walletInitiated: initiated.has(t.hash ?? ""),
        usdRate: null,
      });
      if (ts && (out.lastTs === null || ts > out.lastTs)) {
        out.lastTs = ts;
        out.lastTx = { ts, hash: t.hash ?? "" };
      }
    }
    if (d.result.length < 100) break;
    if (p === maxT) out.truncated = true;
  }

  const bal = await call({ module: "account", action: "balance", address: a, tag: "latest" }).catch(() => null);
  if (bal?.status === "1" && typeof bal.result === "string") {
    out.nativeBalance = Number(BigInt(hexOrDecToBigStr(bal.result))) / 1e18;
  }

  out.scanned = out.transfers.length;
  return out;
}
