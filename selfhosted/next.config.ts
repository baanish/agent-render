import type { NextConfig } from "next";
import path from "node:path";

const parentSrc = path.resolve(__dirname, "../src");

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  transpilePackages: ["@shared"],
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@shared": parentSrc,
      "@": parentSrc,
      "@self": path.resolve(__dirname, "src"),
    };
    return config;
  },
};

export default nextConfig;
