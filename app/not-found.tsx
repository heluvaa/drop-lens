import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel mx-auto max-w-lg p-8 text-center">
      <p className="mono text-xs uppercase tracking-widest text-neon">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">Halaman tidak ada</h1>
      <p className="mt-2 text-sm text-mute">
        Yang kamu cari tidak ketemu. Balik ke halaman utama untuk memindai alamat.
      </p>
      <Link
        href="/"
        className="mt-5 inline-block rounded-lg border border-neon-dim/50 bg-neon/15 px-4 py-2 text-sm font-semibold text-neon hover:bg-neon/25"
      >
        Ke halaman utama
      </Link>
    </div>
  );
}