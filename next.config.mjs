/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are the only write path in this app; keep the payload
    // ceiling low so a malformed CSV import fails fast rather than in the DB.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
