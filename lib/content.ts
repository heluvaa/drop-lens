// Semua teks situs ada di satu file. Ubah di sini, komponen tidak perlu disentuh.

export const site = {
  name: "DropLens",
  tagline: "Cek airdrop yang pernah masuk ke wallet EVM atau Solana — lengkap dengan jumlah token, tanggal, dan status claim.",
  domain: "https://droplens.vercel.app",
  demo: false,
  repo: "https://github.com/heluvaa/drop-lens",
};

export const copy = {
  hero: {
    kicker: "EVM · Solana · read-only",
    title: "Wallet ini pernah dapat airdrop apa saja?",
    sub:
      "Tempel satu alamat. DropLens memindai riwayat transfer masuk di banyak chain, mencocokkannya dengan registry airdrop yang diverifikasi on-chain, lalu menandai mana yang kamu claim sendiri dan mana yang masuk otomatis.",
    cta: "Pindai alamat",
    placeholder: "0x… atau alamat Solana base58",
    hint: "Read-only. Tidak minta tanda tangan, tidak minta seed phrase, tidak menyimpan alamat.",
  },
  how: [
    {
      t: "1 · Kumpulkan transfer masuk",
      d: "Semua transfer ERC-20 yang masuk ke wallet, plus transaksi yang wallet sendiri yang memicu, per chain. Untuk Solana: delta saldo token di tiap transaksi.",
    },
    {
      t: "2 · Pisahkan claim vs push",
      d: "Kontrak distributor resmi airdrop dipakai untuk menandai claim — termasuk kalau ada relayer yang mengirim transaksinya atas nama wallet. Token yang datang tanpa jejak itu dianggap push.",
    },
    {
      t: "3 · Cocokkan & karantina",
      d: "Token dicocokkan ke registry airdrop (33 entri, semuanya diverifikasi on-chain). Token phishing yang memancing ke situs drainer dipisahkan, bukan dihitung.",
    },
  ],
  coverageNote:
    "Chain tanpa explorer publik gratis dilewati dan tetap dilaporkan apa adanya — bukan disembunyikan. Pasang API key gratis untuk membukanya.",
  samples: [
    { label: "vitalik.eth", value: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
    { label: "Penerima airdrop UNI", value: "0x71a6AD75809987807Bc3D9aB37059D7C37837607" },
    { label: "Wallet Solana aktif", value: "D5YqVMoSxnqeZAKAUUE1Dm3bmjtdxQ5DCF356ozqN9cM" },
  ],
  ideas: [
    { t: "Riwayat claim", d: "Tanggal, jumlah token, dan link transaksi untuk tiap airdrop yang ketemu." },
    { t: "Umur wallet", d: "Diambil dari transaksi paling awal — bukan perkiraan dari aktivitas terbaru." },
    { t: "Karantina spam", d: "Token umpan drainer (nama berisi URL/claim/reward) dipisah dan tidak dihitung." },
    { t: "Cakupan scan", d: "Chain mana yang benar-benar dipindai, mana yang dilewati, dan kenapa." },
  ],
  faq: [
    {
      q: "Kenapa sebagian chain tidak ada hasilnya?",
      a: "Explorer publik beberapa chain (Base, Arbitrum, Polygon, BNB, Gnosis) memblokir akses tanpa key. Isi ETHERSCAN_API_KEY gratis dan chain-chain itu langsung ikut dipindai.",
    },
    {
      q: "Kenapa ada event berlabel 'tebakan'?",
      a: "Itu token yang masuk dari sebuah kontrak padahal wallet tidak pernah mengirim token tersebut — ciri khas airdrop, tapi bukan konfirmasi. Kalau tokennya ada di registry, labelnya 'registry' dan itu yang paling kuat.",
    },
    {
      q: "Apakah ini membaca seed phrase atau menandatangani transaksi?",
      a: "Tidak. Hanya alamat publik yang dibaca. Semua data diambil dari explorer publik, RPC publik, dan API harga — tidak ada transaksi yang dikirim.",
    },
    {
      q: "Kenapa nilai USD-nya kasar?",
      a: "Kurs yang dipakai adalah harga saat scan, bukan harga saat airdrop jatuh. Anggap semuanya estimasi.",
    },
  ],
  envNote: [
    { k: "ETHERSCAN_API_KEY", d: "gratis, 1 key untuk 60+ chain — membuka Base, Arbitrum, Polygon, BNB, Linea, Mantle, Blast, Mode, Zora, Berachain, dll." },
    { k: "HELIUS_API_KEY", d: "gratis — memindai riwayat Solana jauh lebih dalam dan tanpa jeda rate limit." },
  ],
};
