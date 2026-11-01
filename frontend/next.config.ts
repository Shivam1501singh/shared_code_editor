import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use a single worker during static export to eliminate Windows parallel mkdir collisions
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
