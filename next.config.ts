import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proyek di bawah $HOME membuat Next menyimpulkan tracing root ke home.
  outputFileTracingRoot: process.cwd(),
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
