import type { NextConfig } from "next";
import path from "node:path";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  distDir: isDev ? ".next-v2-dev" : ".next-v2",
  output: isDev ? undefined : "standalone",
};

export default nextConfig;
