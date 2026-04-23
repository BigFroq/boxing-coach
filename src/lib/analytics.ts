// Thin PostHog wrapper — lazy-loads so we never break the render path when the
// analytics bundle hasn't finished loading. Every call is fire-and-forget.

import posthog from "posthog-js";

function canCapture(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY) &&
    posthog.__loaded === true
  );
}

export function track(event: string, props?: Record<string, unknown>) {
  try {
    if (!canCapture()) return;
    posthog.capture(event, props);
  } catch {
    // never let analytics break a user action
  }
}

export function identify(userId: string, props?: Record<string, unknown>) {
  try {
    if (!canCapture()) return;
    posthog.identify(userId, props);
  } catch {
    // ignore
  }
}
