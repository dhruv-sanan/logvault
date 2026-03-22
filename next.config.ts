import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker builds only.
  // Set DOCKER_BUILD=true in the build environment (see Dockerfile).
  // Do NOT set this on Vercel — it breaks serverless deployments.
  ...(process.env.DOCKER_BUILD === "true" ? { output: "standalone" } : {}),
};

export default nextConfig;
