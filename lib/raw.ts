import type { CoverageStatus, TokenRef } from "./types";

/** Transfer ternormalisasi dari provider mana pun. */
export interface RawTransfer {
  token: TokenRef;
  from: string;
  to: string;
  /** null = provider tidak memberi tahu (diisi lewat probe eth_getCode). */
  fromIsContract: boolean | null;
  amount: number;
  amountRaw: string;
  ts: number;
  txHash: string;
  direction: "in" | "out";
  /** Transaksi penerimaan ini di-initiate oleh wallet kita sendiri. */
  walletInitiated: boolean;
  /** Kurs USD saat scan dari provider (bukan harga historis). */
  usdRate: number | null;
}

export interface RawTx {
  hash: string;
  to: string;
  ts: number;
  method: string | null;
}

export interface ChainScan {
  chainKey: string;
  chainName: string;
  status: CoverageStatus;
  reason?: string;
  transfers: RawTransfer[];
  txs: RawTx[];
  firstTx: { ts: number; hash: string } | null;
  lastTs: number | null;
  /** Aktivitas terbaru yang benar-benar terlihat (tx atau transfer), untuk link di UI. */
  lastTx: { ts: number; hash: string } | null;
  txCount: number | null;
  transferCount: number | null;
  nativeBalance: number | null;
  nativeSymbol: string;
  label: string | null;
  isContract: boolean | null;
  proxyType: string | null;
  truncated: boolean;
  scanned: number;
}

export function emptyChainScan(
  chainKey: string,
  chainName: string,
  nativeSymbol: string,
  status: CoverageStatus = "scanned",
  reason?: string,
): ChainScan {
  return {
    chainKey,
    chainName,
    status,
    reason,
    transfers: [],
    txs: [],
    firstTx: null,
    lastTs: null,
    lastTx: null,
    txCount: null,
    transferCount: null,
    nativeBalance: null,
    nativeSymbol,
    label: null,
    isContract: null,
    proxyType: null,
    truncated: false,
    scanned: 0,
  };
}
