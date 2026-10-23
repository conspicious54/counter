import type { NextConfig } from "next";
const config: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: process.env.COMMIT_REF || "local" },
};
export default config;
