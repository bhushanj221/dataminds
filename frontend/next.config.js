/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable polling for hot reload inside Docker on Windows (WSL2 volume mounts)
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      }
    }
    return config
  },
  async rewrites() {
    // In Docker: BACKEND_URL = http://backend:8000
    // Locally:   BACKEND_URL = http://localhost:8000
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
