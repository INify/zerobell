import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the dev-mode route badge: this demo is presented on a projector.
  devIndicators: false,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
