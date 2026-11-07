// Verifikasi registry on-chain. Jalankan: node scripts/verify-registry.mjs
// EVM : eth_call symbol() + decimals(), distributor via eth_getCode
// SOL : simbol mint dicek lewat DexScreener
// Entri yang gagal verifikasi DIBUANG dari manifest (jangan diamkan alamat karangan).

import { readFileSync, writeFileSync } from "node:fs";

const RPCS = {
  ethereum: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://eth.llamarpc.com"],
  arbitrum: ["https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org"],
  base: ["https://base-rpc.publicnode.com", "https://base.drpc.org"],
  optimism: ["https://optimism-rpc.publicnode.com", "https://optimism.drpc.org"],
  zksync: ["https://zksync-era-rpc.publicnode.com", "https://zksync.drpc.org"],
  scroll: ["https://scroll-rpc.publicnode.com"],
  polygon: ["https://polygon-bor-rpc.publicnode.com"],
};

const SEL_SYMBOL = "0x95d89b41";
const SEL_DECIMALS = "0x313ce567";

function pickRpc(chain) {
  const l = RPCS[chain] || RPCS.ethereum;
  return l;
}

async function rpcCall(urls, method, params) {
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "curl/8.7.1" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) {
      lastErr = `${url}: ${e.message}`;
    }
  }
  throw new Error(lastErr || "all rpc failed");
}
let lastErr = "";

function decodeString(hex) {
  if (!hex || hex === "0x") return null;
  const body = hex.slice(2);
  if (body.length === 64) {
    // bytes32 symbol
    const bytes = body.match(/.{2}/g) || [];
    const s = bytes.map((b) => parseInt(b, 16)).filter((n) => n > 0).map((n) => String.fromCharCode(n)).join("");
    return s || null;
  }
  try {
    const len = parseInt(body.slice(64, 128), 16);
    const data = body.slice(128, 128 + len * 2);
    const bytes = data.match(/.{2}/g) || [];
    return bytes.map((b) => String.fromCharCode(parseInt(b, 16))).join("").replace(/\0+$/, "") || null;
  } catch {
    return null;
  }
}

const src = readFileSync(new URL("../lib/registry.ts", import.meta.url), "utf8");
// Ambil objek entri secara kasar dari teks TS (script verifikasi, bukan parser).
const entries = [];
const re = /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*program:\s*"([^"]+)",\s*chain:\s*"([^"]+)",\s*kind:\s*"(evm|solana)",\s*token:\s*"([^"]+)",\s*symbol:\s*"([^"]+)",(\s*distributor:\s*"([^"]+)",)?/g;
let m;
while ((m = re.exec(src))) {
  entries.push({ id: m[1], name: m[2], program: m[3], chain: m[4], kind: m[5], token: m[6], symbol: m[7], distributor: m[9] || null });
}
console.log(`registry: ${entries.length} entri dibaca\n`);

const results = [];
for (const e of entries) {
  if (e.kind === "evm") {
    let symbol = null, decimals = null, dist = null, err = null;
    try {
      const urls = pickRpc(e.chain);
      const hex = await rpcCall(urls, "eth_call", [{ to: e.token, data: SEL_SYMBOL }, "latest"]);
      symbol = decodeString(hex);
      const dhex = await rpcCall(urls, "eth_call", [{ to: e.token, data: SEL_DECIMALS }, "latest"]);
      decimals = dhex && dhex !== "0x" ? parseInt(dhex.slice(2), 16) : null;
      if (e.distributor) {
        const code = await rpcCall(urls, "eth_getCode", [e.distributor, "latest"]);
        dist = code && code !== "0x" ? "contract" : "EOA/none";
      }
    } catch (ex) {
      err = ex.message.slice(0, 70);
    }
    const pass = symbol && symbol.trim().toUpperCase() === e.symbol.toUpperCase();
    results.push({ ...e, symbol_found: symbol, decimals, dist, err, pass });
    console.log(
      `${pass ? "OK  " : "FAIL"} ${e.chain.padEnd(10)} ${String(e.symbol).padEnd(8)} found=${String(symbol).padEnd(9)} dec=${decimals ?? "?"} dist=${dist ?? "-"} ${err ? "err=" + err : ""}`,
    );
  } else {
  let symbol = null, err = null;
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${e.token}`, {
      headers: { "User-Agent": "curl/8.7.1" },
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    const pairs = j.pairs || [];
    const best = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    symbol = best?.baseToken?.symbol || null;
    if (!best) err = "tidak ada pair di DexScreener";
  } catch (ex) {
    err = ex.message.slice(0, 70);
  }
  // Fallback: Jupiter token API (Solana) kalau DexScreener tidak punya pair.
  if (!symbol) {
    try {
      const r = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${e.token}`, {
        headers: { "User-Agent": "curl/8.7.1" },
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json();
      const hit = (Array.isArray(j) ? j : []).find((t) => t.id === e.token);
      if (hit?.symbol) {
        symbol = hit.symbol;
        err = null;
      }
    } catch (ex) {
      if (!err) err = ex.message.slice(0, 70);
    }
  }
    const pass = symbol && symbol.trim().toUpperCase() === e.symbol.toUpperCase();
    results.push({ ...e, symbol_found: symbol, err, pass });
    console.log(`${pass ? "OK  " : "FAIL"} ${e.chain.padEnd(10)} ${String(e.symbol).padEnd(8)} found=${String(symbol).padEnd(9)} ${err ? "err=" + err : ""}`);
  }
}

const failed = results.filter((r) => !r.pass);
const evmBadDist = results.filter((r) => r.distributor && r.dist === "EOA/none");

console.log(`\n== HASIL ==\nlolos: ${results.length - failed.length}/${results.length}`);
if (failed.length) console.log(`\nENTRI GAGAL (harus dibuang/diperbaiki):\n` + failed.map((f) => `  - ${f.id}: ${f.chain}/${f.symbol} found=${f.symbol_found ?? "-"} ${f.err || ""}`).join("\n"));
if (evmBadDist.length) console.log(`\nDISTRIBUTOR TIDAK ADA KODE (harus dibuang field-nya):\n` + evmBadDist.map((f) => `  - ${f.id}: ${f.distributor}`).join("\n"));

writeFileSync(new URL("./registry-verification.json", import.meta.url), JSON.stringify(results, null, 2));
console.log(`\nmanifest: scripts/registry-verification.json`);
