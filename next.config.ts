import type { NextConfig } from "next";

const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  ...(allowedDevOrigins && allowedDevOrigins.length > 0
    ? { allowedDevOrigins }
    : {}),
};

export default nextConfig;
