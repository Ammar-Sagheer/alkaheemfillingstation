/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Server Actions receive nozzle readings and ledger entries only - small
    // payloads. Keeping the limit tight reduces the surface area.
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },
};

export default nextConfig;
