// Tipe data bersama untuk seluruh pipeline scan DropLens.

export type AddrKind = "evm" | "solana";

export interface ChainDef {
  key: string;
  name: string;
  kind: AddrKind;
  native: string;
  /** Halaman explorer untuk link tx. */
  explorer: string;
  /** Base URL API Blockscout v2 (kalau chain ini punya instance Blockscout yang bisa diakses). */
  bs?: string;
  /** Instance Blockscout ada tapi diblokir Cloudflare → wajib API key Etherscan. */
  bsBlocked?: boolean;
  /** Blockscout v1 (Etherscan-compatible) tersedia untuk sort=asc. */
  v1?: boolean;
  /** chainid untuk Etherscan V2 API (satu key untuk semua chain). */
  es?: number;
  /** Endpoint Etherscan-compatible tanpa key (Routescan). */
  rs?: string;
  /** Masuk daftar scan default. */
  core?: boolean;
  /** Address kontrak native-wrapped / umum yang bukan airdrop. */
  common?: string[];
}

export interface TokenRef {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export type EventKind = "claim" | "push";
export type Confidence = "registry" | "heuristic";

export interface AirdropEvent {
  id: string;
  chainKey: string;
  chainName: string;
  token: TokenRef;
  amount: number;
  amountRaw: string;
  kind: EventKind;
  /** ISO string. */
  date: string;
  ts: number;
  txHash: string;
  from: string;
  fromIsContract: boolean;
  explorerUrl: string;
  /** Estimasi nilai USD pada saat event (null = tidak ada data harga). */
  usd: number | null;
  confidence: Confidence;
  /** Nama program airdrop dari registry, kalau cocok. */
  program?: string;
  /** Sisa saldo token ini di wallet saat scan (null = tidak diketahui). */
  held: number | null;
  /** Registry memberi catatan konteks (mis. tanggal klaim dibuka). */
  note?: string;
}

export interface SpamHit {
  id: string;
  chainKey: string;
  chainName: string;
  symbol: string;
  name: string;
  address: string;
  amount: number;
  date: string;
  ts: number;
  txHash: string;
  explorerUrl: string;
  reason: string;
}

export type CoverageStatus = "scanned" | "partial" | "skipped" | "error";

export interface ChainCoverage {
  chainKey: string;
  chainName: string;
  kind: AddrKind;
  status: CoverageStatus;
  reason?: string;
  transfersScanned: number;
  truncated: boolean;
}

export interface ActivityPoint {
  chainKey: string;
  chainName: string;
  ts: number;
  date: string;
  txHash: string;
  explorerUrl: string;
}

export interface NativeBalance {
  chainKey: string;
  chainName: string;
  symbol: string;
  balance: number;
  usd: number | null;
}

export interface WalletProfile {
  address: string;
  kind: AddrKind;
  label: string | null;
  isContract: boolean | null;
  proxyType: string | null;
  firstActivity: ActivityPoint | null;
  lastActivity: ActivityPoint | null;
  ageDays: number | null;
  txCount: number | null;
  transferCount: number | null;
  chainsActive: number;
  native: NativeBalance[];
}

export interface RegistryEntry {
  id: string;
  name: string;
  chain: string;
  kind: AddrKind;
  /** Kontrak ERC-20 (EVM) atau mint (Solana). */
  token: string;
  symbol: string;
  /** Nama program/perusahaan di balik airdrop. */
  program: string;
  /** Distributor/claim contract — dipakai untuk menandai "claim". */
  distributor?: string;
  note?: string;
}

export interface ScanTotals {
  events: number;
  claims: number;
  pushes: number;
  usd: number | null;
  usdCovered: number;
  chainsWithEvents: number;
  spamCount: number;
}

export interface ScanReport {
  ok: true;
  address: string;
  kind: AddrKind;
  generatedAt: string;
  elapsedMs: number;
  profile: WalletProfile;
  events: AirdropEvent[];
  spam: SpamHit[];
  coverage: ChainCoverage[];
  totals: ScanTotals;
  notes: string[];
  keys: { etherscan: boolean; helius: boolean };
}

export interface ScanError {
  ok: false;
  error: string;
  hint?: string;
}
