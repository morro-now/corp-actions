import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@morro/sdk", "@morro/services"],
  serverExternalPackages: ["@coral-xyz/anchor", "@solana/web3.js", "@solana/spl-token", "@solana/spl-token-metadata"],
  turbopack: { root: path.join(__dirname, "..") },
  outputFileTracingRoot: path.join(__dirname, ".."),
  agentRules: false,
};

export default nextConfig;
