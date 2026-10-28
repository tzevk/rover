/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["mysql2"],
  // The test suite builds into its own folder so it never collides with a running `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
