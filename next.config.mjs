/** @type {import('next').NextConfig} */
const nextConfig = {
  // Separate dev/build output — prevents `next build` from breaking `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.prod.website-files.com",
      },
    ],
  },
};

export default nextConfig;
