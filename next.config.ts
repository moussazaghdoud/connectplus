import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["rainbow-node-sdk"],
};

export default nextConfig;
