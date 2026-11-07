import type { AirdropEvent, ChainCoverage, SpamHit, TokenRef, RegistryEntry } from "./types";
import type { ChainScan, RawTransfer } from "./raw";
import type { SolInbound, SolanaScan, SolHolding } from "./providers/solana";
import { BY_SYMBOL, BY_TOKEN } from "./registry";
import { CHAIN_BY_KEY } from "./chains";

// ---------------- Filter spam / phishing token ----------------
// Aturan ini diambil dari triage spam wallet EVM: nama token yang berisi URL atau kata
// "claim/airdrop/reward" adalah umpan phishing yang mendorong korban membuka situs
// drainer. Token seperti ini TIDAK dihitung sebagai airdrop — dikarantina terpisah.

const SPAM_TEXT =
  /(https?:\/\/|www\.|\.com|\.net|\.org|\.io\b|\.xyz|\.app|\.site|\bclaim\b|\bairdrop\b|\breward\b|\bredeem\b|\bvisit\b|\bbonus\b|\bvoucher\b|\bfree\b|t\.ly|bit\.ly|cutt\.ly|is\.gd|🎁|🎉|🚀|💰|🔒|✅|🪂|💎)/i;

/** Simbol blue-chip: token ini diterima lewat transfer biasa, bukan airdrop. */
const MAJOR_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "WETH",
  "ETH",
  "WBTC",
  "BTC",
  "WSTETH",
  "STETH",
  "RETH",
  "CBETH",
  "FRAX",
  "LUSD",
  "USDE",
  "SUSDE",
  "USDS",
  "PYUSD",
  "GHO",
  "TUSD",
  "BUSD",
  "LINK",
  "AAVE",
  "CRV",
  "MKR",
  "SNX",
  "COMP",
  "LDO",
  "MATIC",
  "WMATIC",
  "POL",
  "BNB",
  "WBNB",
  "AVAX",
  "WAVAX",
  "SOL",
  "WSOL",
  "CELO",
  "XDAI",
  "MNT",
  "BERA",
  "SEI",
  "APE",
  "RBTC",
]);

/** Alamat kanonik untuk deteksi impersonasi (symbol sama, kontrak beda = spam). */
const CANONICAL: Record<string, string> = {
  "ethereum:USDC": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "ethereum:USDT": "0xdac17f958d2ee523a2206206994597c13d831ec7",
  "ethereum:DAI": "0x6b175474e89094c44da98b954eedeac495271d0f",
  "ethereum:WETH": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  "ethereum:WBTC": "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
};

const NULL_ADDR = "0x0000000000000000000000000000000000000000";
const SOL_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McGqCe8BenwNYB";
const SOL_MAJOR = new Set([SOL_USDC, SOL_USDT, "So11111111111111111111111111111111111111112"]);

/** Likuiditas minimum (USD) sebelum token masuk sebagai "tebakan". */
export const MIN_LIQ_USD = 5000;

/**
 * Token yang perlu dicek pasarnya sebelum boleh masuk sebagai "tebakan":
 * bukan registry, bukan blue-chip, dan bukan token bertanda phishing.
 */
export function needsMarketCheck(chainKey: string, token: TokenRef): boolean {
  if (registryFor(chainKey, token)) return false;
  if (MAJOR_SYMBOLS.has(token.symbol.toUpperCase())) return false;
  if (SPAM_TEXT.test(`${token.symbol} ${token.name}`)) return false;
  return true;
}

export function spamReason(chainKey: string, token: TokenRef, _amount: number): string | null {
  const text = `${token.symbol} ${token.name}`;
  if (SPAM_TEXT.test(text)) return "nama/simbol memuat tautan atau kata pancingan (claim/airdrop/reward)";
  const canon = CANONICAL[`${chainKey}:${token.symbol.toUpperCase()}`];
  if (canon && token.address.toLowerCase() !== canon) {
    return `impersonasi ${token.symbol.toUpperCase()} (kontrak bukan yang asli)`;
  }
  return null;
}

// ---------------- Klasifikasi EVM ----------------

export interface Detected {
  events: AirdropEvent[];
  spam: SpamHit[];
}

function registryFor(chainKey: string, token: TokenRef): RegistryEntry | undefined {
  return (
    BY_TOKEN.get(token.address.toLowerCase()) ??
    BY_TOKEN.get(token.address) ??
    BY_SYMBOL.get(`${chainKey}|${token.symbol.toUpperCase()}`)
  );
}

export function detectEVM(
  scans: ChainScan[],
  wallet: string,
  hasMarket: (chainKey: string, tokenAddress: string) => boolean,
): Detected {
  const a = wallet.toLowerCase();
  const events: AirdropEvent[] = [];
  const spam: SpamHit[] = [];

  for (const cs of scans) {
    const chain = CHAIN_BY_KEY[cs.chainKey];

    // Kelompokkan per kontrak token untuk tahu apakah wallet pernah MENGIRIM token ini.
    const byToken = new Map<string, { ins: RawTransfer[]; outs: RawTransfer[] }>();
    for (const t of cs.transfers) {
      if (t.token.address.toLowerCase() === NULL_ADDR) continue;
      if (t.from === t.to) continue;
      if (t.to !== a && t.from !== a) continue;
      const k = t.token.address.toLowerCase();
      const g = byToken.get(k) ?? { ins: [], outs: [] };
      (t.direction === "in" ? g.ins : g.outs).push(t);
      byToken.set(k, g);
    }

    for (const [, g] of byToken) {
      const outboundTotal = g.outs.reduce((s, t) => s + t.amount, 0);
      for (const t of g.ins) {
        const reg = registryFor(cs.chainKey, t.token);
        const reason = spamReason(cs.chainKey, t.token, t.amount);
        if (reason) {
          spam.push({
            id: `${cs.chainKey}:${t.txHash}:${t.token.address}`,
            chainKey: cs.chainKey,
            chainName: cs.chainName,
            symbol: t.token.symbol,
            name: t.token.name,
            address: t.token.address,
            amount: t.amount,
            date: new Date(t.ts * 1000).toISOString(),
            ts: t.ts,
            txHash: t.txHash,
            explorerUrl: `${chain?.explorer ?? ""}/tx/${t.txHash}`,
            reason,
          });
          continue;
        }

        const neverSent = g.outs.length === 0;
        const isMajor = MAJOR_SYMBOLS.has(t.token.symbol.toUpperCase());
        // "Tebakan" harus lolos saringan pasar: token yang benar-benar diperdagangkan.
        // Tanpa ini, wallet sibuk akan dibanjiri token spam yang juga datang dari kontrak
        // (KIMJONGUN, ELON2028, dan sejenisnya) sehingga laporan jadi tidak berguna.
        const heuristic =
          !reg &&
          t.fromIsContract === true &&
          neverSent &&
          !isMajor &&
          t.amount > 0 &&
          hasMarket(cs.chainKey, t.token.address);

        if (!reg && !heuristic) continue;

        const netHeld = g.ins.reduce((s, x) => s + x.amount, 0) - outboundTotal;
        const usd = t.usdRate != null ? t.amount * t.usdRate : null;

        // Claim vs push. Dua jalur dianggap claim:
        //  (a) wallet sendiri yang mengirim transaksi penerimaan itu, atau
        //  (b) token datang dari distributor resmi airdrop / kontrak tokennya sendiri —
        //      menutup kasus claim yang dikirim relayer atas nama wallet (wallet tidak bayar gas).
        const fromDistributor =
          !!reg &&
          (reg.distributor?.toLowerCase() === t.from || reg.token.toLowerCase() === t.from);

        events.push({
          id: `${cs.chainKey}:${t.txHash}:${t.token.address}:${t.ts}`,
          chainKey: cs.chainKey,
          chainName: cs.chainName,
          token: t.token,
          amount: t.amount,
          amountRaw: t.amountRaw,
          kind: t.walletInitiated || fromDistributor ? "claim" : "push",
          date: new Date(t.ts * 1000).toISOString(),
          ts: t.ts,
          txHash: t.txHash,
          from: t.from,
          fromIsContract: t.fromIsContract === true,
          explorerUrl: `${chain?.explorer ?? ""}/tx/${t.txHash}`,
          usd,
          confidence: reg ? "registry" : "heuristic",
          program: reg?.program,
          held: netHeld > 0 ? netHeld : 0,
          note: reg?.note,
        });
      }
    }
  }
  return { events, spam };
}

// ---------------- Klasifikasi Solana ----------------

export function detectSolana(
  scan: SolanaScan | null,
  holdings: SolHolding[],
  priceOf: (mint: string) => { symbol: string; name: string; decimals: number; usd: number | null; liq: number } | null,
): Detected {
  const events: AirdropEvent[] = [];
  const spam: SpamHit[] = [];
  if (!scan) return { events, spam };

  const heldAmount = new Map(holdings.map((h) => [h.mint, h.amount]));

  for (const ib of scan.inbound) {
    const reg = BY_TOKEN.get(ib.mint);
    const meta = priceOf(ib.mint);
    const token: TokenRef = {
      address: ib.mint,
      symbol: meta?.symbol ?? reg?.symbol ?? "???",
      name: meta?.name ?? reg?.name ?? "Token tanpa metadata",
      decimals: ib.decimals ?? meta?.decimals ?? 0,
    };
    const usdRate = meta?.usd ?? null;

    const reason = spamReason("solana", token, ib.amount);
    if (reason) {
      spam.push({
        id: `solana:${ib.txHash}:${ib.mint}`,
        chainKey: "solana",
        chainName: "Solana",
        symbol: token.symbol,
        name: token.name,
        address: ib.mint,
        amount: ib.amount,
        date: new Date(ib.ts * 1000).toISOString(),
        ts: ib.ts,
        txHash: ib.txHash,
        explorerUrl: `https://solscan.io/tx/${ib.txHash}`,
        reason,
      });
      continue;
    }

    const isMajor = SOL_MAJOR.has(ib.mint);
    // Sama seperti EVM: hanya token yang punya pasar nyata yang dianggap tebakan airdrop.
    const heuristic =
      !reg && !isMajor && ib.amount > 0 && !ib.walletInitiated && (meta?.liq ?? 0) >= MIN_LIQ_USD;
    if (!reg && !heuristic) continue;

    events.push({
      id: `solana:${ib.txHash}:${ib.mint}`,
      chainKey: "solana",
      chainName: "Solana",
      token,
      amount: ib.amount,
      amountRaw: String(Math.round(ib.amount * Math.pow(10, ib.decimals))),
      kind: ib.walletInitiated ? "claim" : "push",
      date: new Date(ib.ts * 1000).toISOString(),
      ts: ib.ts,
      txHash: ib.txHash,
      from: ib.from,
      fromIsContract: false,
      explorerUrl: `https://solscan.io/tx/${ib.txHash}`,
      usd: usdRate != null ? ib.amount * usdRate : null,
      confidence: reg ? "registry" : "heuristic",
      program: reg?.program,
      held: heldAmount.get(ib.mint) ?? 0,
      note: reg?.note,
    });
  }
  return { events, spam };
}

export function coverageFromEVM(scans: ChainScan[]): ChainCoverage[] {
  return scans.map((s) => ({
    chainKey: s.chainKey,
    chainName: s.chainName,
    kind: "evm" as const,
    status: s.status,
    reason: s.reason,
    transfersScanned: s.scanned,
    truncated: s.truncated,
  }));
}

export function coverageFromSolana(s: SolanaScan | null): ChainCoverage {
  if (!s) {
    return {
      chainKey: "solana",
      chainName: "Solana",
      kind: "solana",
      status: "skipped",
      reason: "tidak dijalankan",
      transfersScanned: 0,
      truncated: false,
    };
  }
  return {
    chainKey: "solana",
    chainName: "Solana",
    kind: "solana",
    status: s.status,
    reason:
      s.reason ??
      (s.timeLimited
        ? "pemindaian dihentikan karena anggaran waktu RPC publik — hasil bisa belum lengkap"
        : s.ageTruncated
          ? `umur wallet dihitung dari ${s.sigWalked.toLocaleString("id-ID")} signature terakhir — wallet bisa lebih tua`
          : undefined),
    transfersScanned: s.inbound.length,
    truncated: s.timeLimited || s.ageTruncated,
  };
}
