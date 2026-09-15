import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@adluv/auth", "@adluv/config", "@adluv/ui"],
};

export default nextConfig;
