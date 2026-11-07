import { NextResponse } from "next/server";
import { scanAddress, validateAddress } from "@/lib/scan";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Rate limit in-memory: cukup untuk satu instance. Kalau nanti dipakai rame,
// pindahkan ke penyimpanan bersama (Postgres/KV) — bukan di sini.
const HITS = new Map<string, { n: number; reset: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const LIMIT = 8;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

function take(ip: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const cur = HITS.get(ip);
  if (!cur || now > cur.reset) {
    HITS.set(ip, { n: 1, reset: now + WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  if (cur.n >= LIMIT) return { ok: false, retryAfter: Math.ceil((cur.reset - now) / 1000) };
  cur.n += 1;
  return { ok: true, retryAfter: 0 };
}

interface Body {
  address?: unknown;
  chains?: unknown;
  depth?: unknown;
}

const CHAIN_ALLOW = new Set([
  "ethereum",
  "arbitrum",
  "base",
  "optimism",
  "polygon",
  "bnb",
  "zksync",
  "linea",
  "scroll",
  "mantle",
  "blast",
  "mode",
  "zora",
  "celo",
  "gnosis",
  "unichain",
  "worldchain",
  "ink",
  "berachain",
  "avalanche",
  "apechain",
  "rootstock",
  "taiko",
  "sei",
  "sonic",
  "polygon-zkevm",
]);

async function handle(addressRaw: string, chainsRaw: unknown, depthRaw: unknown) {
  // Validasi DULU, baru sentuh rate limit — body rusak tidak boleh membakar kuota.
  const v = validateAddress(addressRaw);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  }

  const chains = Array.isArray(chainsRaw)
    ? chainsRaw.filter((c): c is string => typeof c === "string" && CHAIN_ALLOW.has(c))
    : undefined;

  const depthNum = typeof depthRaw === "number" ? depthRaw : Number(depthRaw);
  const solanaDepth =
    Number.isFinite(depthNum) && depthNum > 0 ? Math.min(Math.max(Math.round(depthNum), 20), 500) : undefined;

  try {
    const report = await scanAddress(v.address!, { chains, solanaDepth });
    return NextResponse.json(report);
  } catch (e) {
    const msg = (e as Error).message || "Gagal memindai alamat.";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body harus JSON." }, { status: 400 });
  }

  const v = validateAddress(String(body.address ?? ""));
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  }

  const ip = clientIp(req);
  const gate = take(ip);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: `Terlalu banyak permintaan. Coba lagi dalam ${gate.retryAfter} detik.` },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  return handle(v.address!, body.chains, body.depth);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = url.searchParams.get("address") ?? "";
  const v = validateAddress(address);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  }
  const ip = clientIp(req);
  const gate = take(ip);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: `Terlalu banyak permintaan. Coba lagi dalam ${gate.retryAfter} detik.` },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }
  const depth = url.searchParams.get("depth");
  const chains = url.searchParams.getAll("chain");
  return handle(v.address!, chains.length ? chains : undefined, depth);
}
