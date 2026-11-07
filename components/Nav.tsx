import Link from "next/link";
import { site } from "@/lib/content";

export default function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md border border-neon-dim/40 bg-neon/10">
            <span className="h-2 w-2 rounded-full bg-neon dot-live" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            {site.name}
            <span className="ml-2 hidden text-xs font-normal text-mute sm:inline">airdrop lookup</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-xs">
          <a href="#cek" className="rounded-md px-2.5 py-1.5 text-mute transition hover:bg-white/5 hover:text-white">
            Cek alamat
          </a>
          <a href="#cara" className="hidden rounded-md px-2.5 py-1.5 text-mute transition hover:bg-white/5 hover:text-white sm:block">
            Cara kerja
          </a>
          <a href="#faq" className="hidden rounded-md px-2.5 py-1.5 text-mute transition hover:bg-white/5 hover:text-white sm:block">
            FAQ
          </a>
          <a
            href={site.repo}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-md border border-line-2 px-2.5 py-1.5 text-mute transition hover:border-neon-dim/50 hover:text-white"
          >
            Kode
          </a>
        </nav>
      </div>
    </header>
  );
}
