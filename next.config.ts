import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The Google key and the Supabase service key must never reach the browser;
  // everything public is served from /api/config at runtime instead.
  env: {},
};

export default config;
