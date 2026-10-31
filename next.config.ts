import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    // AVIF first, WebP fallback (Next's default is WebP only).
    formats: ["image/avif", "image/webp"],
  },
};
export default nextConfig;
