# DropLens

Cek airdrop apa saja yang pernah masuk ke sebuah alamat wallet **EVM** atau **Solana**: jumlah token, tanggal,
status claim, estimasi nilai USD, plus umur wallet dan cakupan scan.

Read-only. Tidak menandatangani transaksi, tidak menyimpan alamat, tidak pernah minta seed phrase.

## Jalankan

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm run start -- -p 3100
```

## Isi variabel environment

Situs ini **jalan tanpa API key**, tapi ada dua key gratis yang membuat cakupannya jauh lebih lengkap.
Simpan keduanya sebagai environment variable (di Vercel: Project → Settings → Environment Variables).

| Variabel | Fungsi | Kalau kosong |
|---|---|---|
| `ETHERSCAN_API_KEY` | Satu key untuk 60+ chain — membuka Base, Arbitrum, Polygon, BNB, Linea, Mantle, Blast, Mode, Zora, Berachain, Taiko, Sei, Sonic, dll. | Chain-chain itu dilewati dan dilaporkan "butuh API key Etherscan" di panel cakupan |
| `HELIUS_API_KEY` | RPC Solana berbayar-kelas-gratis: riwayat lebih dalam, tanpa jeda rate limit | Solana dipindai dengan RPC publik, dibatasi transaksi terbaru dan dijeda |

Tanpa `ETHERSCAN_API_KEY`, chain yang tetap jalan: Ethereum, OP Mainnet, ZKsync Era, Scroll, Celo, Unichain,
World Chain, Ink, ApeChain, Rootstock (Blockscout) dan Avalanche (Routescan).

## Cara kerjanya

1. **Kumpulkan transfer masuk.** Per chain: semua transfer ERC-20 ke wallet + transaksi yang wallet sendiri
   yang memicu. Solana: delta saldo token (`preTokenBalances`/`postTokenBalances`) tiap transaksi.
2. **Pisahkan claim vs push.** Kalau transaksi penerimaan itu wallet sendiri yang mengirim → `claim`.
   Kalau token datang tanpa wallet melakukan apa pun → `push`.
3. **Cocokkan + karantina.** Token dicocokkan ke registry; token phishing (nama berisi URL / "claim" /
   "airdrop" / "reward", atau impersonasi simbol blue-chip) masuk karantina dan tidak dihitung.
4. **Tandai tingkat keyakinan.** `registry` = cocok dengan entri terverifikasi. `tebakan` = token masuk dari
   sebuah kontrak padahal wallet tidak pernah mengirim token itu — ciri airdrop, tapi bukan konfirmasi.

## Menambah airdrop ke registry

Semua di `lib/registry.ts`, satu objek per airdrop. Setelah menambah, **wajib** jalankan verifier:

```bash
node scripts/verify-registry.mjs
```

Verifier mengecek tiap entri ke chain-nya sendiri (EVM: `symbol()` + `decimals()` via `eth_call`, distributor
via `eth_getCode`; Solana: simbol mint dari DexScreener, fallback Jupiter). Entri yang gagal verifikasi harus
dibuang. Hasil lengkap ditulis ke `scripts/registry-verification.json`.

Status terakhir: **33/33 entri lolos**.

## Menambah / mematikan chain

`lib/chains.ts`. `bs` = Blockscout (tanpa key), `bsBlocked` = instance Blockscout yang diblokir Cloudflare,
`es` = chainid Etherscan V2, `rs` = endpoint Etherscan-compatible tanpa key, `core: true` = ikut scan default.

## Struktur

```
app/
  page.tsx              halaman utama (hero, cara kerja, FAQ)
  api/scan/route.ts     POST /api/scan { address, depth } — rate limit + validasi
  layout.tsx  globals.css  manifest.ts  robots.ts  not-found.tsx
components/
  Scanner.tsx           form + state pemindaian (client)
  Report.tsx            render laporan
  ui.tsx  Nav.tsx  Footer.tsx  Client.tsx
lib/
  scan.ts               orkestrator: fan-out chain, harga, cache
  detect.ts             engine klasifikasi + triage spam
  registry.ts           33 airdrop terverifikasi on-chain
  chains.ts             daftar chain + endpoint
  providers/evm.ts      Blockscout + Etherscan-compatible + probe eth_getCode
  providers/solana.ts   RPC Solana (rata-limit-aware) + jalur registry-targeted
  http.ts  raw.ts  types.ts  content.ts
scripts/
  verify-registry.mjs   verifikasi registry ke chain (WAJIB sebelum commit)
```

## Batasan yang jujur

- **Coverage ≠ bersih.** Chain yang dilewati tetap dilaporkan di panel "Cakupan scan". Wallet tanpa event di
  laporan bukan berarti wallet itu tidak pernah dapat airdrop.
- **Pemotongan halaman.** Wallet dengan riwayat sangat panjang (ratusan ribu transfer) dipotong pada batas
  halaman; chain itu ditandai "dipotong".
- **USD itu estimasi.** Kurs yang dipakai adalah harga saat scan, bukan harga saat airdrop jatuh.
- **Solana keyless itu lambat.** 1 request per transaksi + rate limit RPC publik → riwayat dibatasi transaksi
  terbaru. Mode "dalam" di UI menaikkan batas, dengan konsekuensi lebih lambat.
- **Rate limit** aplikasi memakai memori proses (`app/api/scan/route.ts`). Di Vercel serverless ini per-instance;
  untuk produksi ramai, pindahkan ke penyimpanan bersama (Postgres/KV).

## Lisensi

MIT.
