import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Low sampling — this is a small-traffic prototype, not a production SaaS.
  // Bump if you want more perf data.
  tracesSampleRate: 0.1,
  // Capture in all envs so smoke tests work locally. Disable by clearing SENTRY_DSN.
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
});
