import type { MetadataRoute } from "next";
import { site } from "@/lib/content";

// Situs ini satu halaman (hasil scan dirender di klien), jadi sitemap-nya satu entri.
// Tanpa file ini robots.txt menunjuk ke sitemap yang 404.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: site.domain,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
