import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // These routes read src/content/clip-review/*.md from disk at request time.
  // File tracing cannot see a path built from process.cwd(), so without this
  // the markdown is absent in the deployed function and every analysis quietly
  // downgrades to the generic prompt.
  //
  // Same story for the vault readers: /api/style-finder reads vault/fighters
  // and /api/drill-program reads vault/drills at request time. Those two dirs
  // are un-gitignored so they exist in the deploy checkout, and traced here so
  // they ship inside the functions.
  outputFileTracingIncludes: {
    "/api/coach/clip-review": ["./src/content/clip-review/*.md"],
    "/api/chat": ["./src/content/clip-review/*.md"],
    "/api/style-finder": ["./vault/fighters/*.md"],
    "/api/drill-program": ["./vault/drills/*.md"],
  },
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
