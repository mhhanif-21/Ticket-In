import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ticket generation runs in serverless worker routes and Sharp/librsvg
  // needs the bundled font files at runtime, not only during the build.
  outputFileTracingIncludes: {
    '/*': ['./assets/fonts/**/*'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      }
    ],
  },
};

export default nextConfig;
