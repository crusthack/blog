import type { NextConfig } from "next";

const configuredApiServerUrl = process.env.API_SERVER_URL?.trim();

if (process.env.NODE_ENV === "production" && !configuredApiServerUrl) {
  throw new Error("API_SERVER_URL is required for a production build.");
}

const apiServerUrl = new URL(configuredApiServerUrl ?? "http://localhost:5268");
if (!["http:", "https:"].includes(apiServerUrl.protocol)) {
  throw new Error("API_SERVER_URL must use the http or https protocol.");
}
apiServerUrl.pathname = apiServerUrl.pathname.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // Local development sends /api uploads through the Next.js proxy. Keep its
    // buffer above the Backend's 25MB PDF limit, including multipart overhead.
    proxyClientMaxBodySize: "32mb",
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiServerUrl.toString().replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
