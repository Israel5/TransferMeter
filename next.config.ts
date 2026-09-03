import type { NextConfig } from "next";

const config: NextConfig = {
  // Mounts every component twice in development so that an effect which is not
  // safe to repeat shows itself here rather than in front of a customer. It is
  // why a page load hits /api twice locally and once in production.
  reactStrictMode: true,
};

export default config;
