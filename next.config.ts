import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack ignores a stray lockfile in the home dir.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
