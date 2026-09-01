import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Quote documents and comparison attachments are streamed from the API with
  // the session cookie attached, so they are fetched client-side rather than
  // proxied through here.
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
};

export default nextConfig;
