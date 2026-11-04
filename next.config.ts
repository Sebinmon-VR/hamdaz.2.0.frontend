import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Quote documents and comparison attachments are streamed from the API with
  // the session cookie attached, so they are fetched client-side rather than
  // proxied through here.
  async redirects() {
    return [
      { source: "/", destination: "/dashboard", permanent: false },
      // Payroll is one page now. The old routes still arrive — the backend's
      // approval notification links to /payroll/runs/{id}, and people keep
      // bookmarks — so each lands on the section it used to be.
      { source: "/payroll/runs/:id", destination: "/payroll?tab=run&run=:id", permanent: false },
      {
        source: "/payroll/employees/:id",
        destination: "/payroll?tab=employees&employee=:id",
        permanent: false,
      },
      { source: "/payroll/employees", destination: "/payroll?tab=employees", permanent: false },
      { source: "/payroll/gratuity", destination: "/payroll?tab=employees", permanent: false },
      { source: "/payroll/settings", destination: "/payroll?tab=settings", permanent: false },
      { source: "/payroll/access", destination: "/payroll?tab=settings", permanent: false },
    ];
  },
};

export default nextConfig;
