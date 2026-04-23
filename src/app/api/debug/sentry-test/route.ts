import { NextResponse } from "next/server";

// Smoke-test route for Sentry wiring. GET /api/debug/sentry-test throws a
// server-side error; Sentry captures it via the onRequestError hook exported
// from instrumentation.ts. Check the Sentry dashboard — the event should
// appear within ~60 seconds with stack + request context.
//
// Safe to leave in the codebase — it's explicit, path-namespaced, and only
// throws when hit. Delete this file if you want it gone post-launch.

export function GET() {
  throw new Error(
    "Sentry smoke test: intentional server error at /api/debug/sentry-test"
  );
  // unreachable
  return NextResponse.json({ ok: true });
}
