import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@adluv/auth", "@adluv/config", "@adluv/ui"],
  async rewrites() {
    if (process.env.NODE_ENV === "production") {
      return [];
    }

    return [
      {
        source: "/ad-assets/:path*",
        destination: "http://127.0.0.1:3101/ad-assets/:path*",
      },
      {
        source: "/advertiser-logos/:path*",
        destination: "http://127.0.0.1:3101/advertiser-logos/:path*",
      },
      {
        source: "/cdn/:path*",
        destination: "http://127.0.0.1:3101/:path*",
      },
    ];
  },
};

export default nextConfig;
