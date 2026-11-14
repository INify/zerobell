import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the dev-mode route badge: this demo is presented on a projector.
  devIndicators: false,
  // The phone companion (/watch) opens this dev server by the laptop's
  // network address. Allow private-network hosts so the phone can load the
  // page's scripts; the hosted build is unaffected.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
