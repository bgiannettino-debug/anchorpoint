import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.openbeta.io" },
      // User-uploaded climb photos in the public Supabase Storage bucket.
      // The project ref is the single subdomain segment, so a one-level
      // wildcard matches it without hardcoding the ref.
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
