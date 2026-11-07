// Helper HTTP: User-Agent browser (RPC/Blockscout menolak request polos dengan 403),
// timeout, dan retry dengan backoff untuk 429/5xx (RPC Solana publik ketat rate limit).

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface FetchOpts {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  /** Jeda dasar antar retry (ms); dinaikkan 2x tiap percobaan. */
  backoffMs?: number;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const { method = "GET", body, timeoutMs = 20000, retries = 2, backoffMs = 400 } = opts;
  let lastErr: Error = new Error("unreachable");

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      if (res.status === 429 || res.status >= 500) {
        throw new HttpError(res.status, `HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw new HttpError(res.status, `HTTP ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e as Error;
      const retriable =
        e instanceof HttpError ? e.status === 429 || e.status >= 500 : true;
      if (!retriable || attempt === retries) break;
      await sleep(backoffMs * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Jalankan promise dengan batas concurrency supaya tidak kena rate limit. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = undefined as unknown as R;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

export function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** Terima "0x..." / angka desimal; kembalikan string angka desimal. */
export function hexOrDecToBigStr(v: unknown): string {
  if (typeof v !== "string") return "0";
  if (v.startsWith("0x") || v.startsWith("0X")) {
    try {
      return BigInt(v).toString();
    } catch {
      return "0";
    }
  }
  return v;
}
