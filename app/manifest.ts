import type { MetadataRoute } from "next";
import { site } from "@/lib/content";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} — cek airdrop per alamat`,
    short_name: site.name,
    description: site.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#05060a",
    theme_color: "#05060a",
    lang: "id",
    icons: [
      {
        src:
          "data:image/svg+xml," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#05060a"/><circle cx="32" cy="32" r="13" fill="none" stroke="#00ffa3" stroke-width="4"/><circle cx="32" cy="32" r="4" fill="#00ffa3"/></svg>',
          ),
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}