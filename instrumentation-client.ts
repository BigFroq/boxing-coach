import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

// Sentry — client-side error tracking.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Record user sessions only on errors to keep replay volume low on free tier.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  environment:
    process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
});

// PostHog — product analytics.
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
if (posthogKey && typeof window !== "undefined") {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_pageview: false, // we fire manually so SPA nav is captured correctly
    autocapture: false, // keep noise down — we emit intentional events
    person_profiles: "identified_only",
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") ph.debug(false);
    },
  });
}

// Nav events → PostHog pageview + Sentry breadcrumb.
export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse"
) {
  try {
    if (typeof window !== "undefined" && posthogKey) {
      posthog.capture("$pageview", { $current_url: url, nav_type: navigationType });
    }
  } catch {
    // Never let analytics break navigation
  }
}
