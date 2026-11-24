import path from "node:path";
export default {
  webpack(config) {
    config.resolve.alias["@"] = path.resolve(process.cwd(), "../apps/frontend/src");
    return config;
  },
  output: 'export',
  basePath: process.env.PAGES_BASE_PATH || '',
  trailingSlash: true,
  images: { unoptimized: true },
};
