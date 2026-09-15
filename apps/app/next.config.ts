import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@adluv/auth", "@adluv/config", "@adluv/source-adapters", "@adluv/ui"],
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const posthogRewrites = [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://eu-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];

    if (process.env.NODE_ENV === "production") {
      return posthogRewrites;
    }

    return [
      ...posthogRewrites,
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
