import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '100gb',
    },
  },
  // Allow large video file uploads through API routes via busboy streaming
  // The actual limit is enforced by busboy (100GB), not Next.js
};

export default nextConfig;
