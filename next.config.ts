import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // Org + project slugs. These matter for source map upload and are no-ops
  // locally without SENTRY_AUTH_TOKEN. Update if your org slug differs in the
  // Sentry UI (Settings → Organization General → slug).
  org: "self-ofd",
  project: "boxing-coach",
  silent: !process.env.CI,
  // Route Sentry events through a same-origin tunnel so ad-blockers don't eat them.
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
});
