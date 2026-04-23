import type { Page, Route } from "@playwright/test";

/**
 * Stubs `/api/chat` with a deterministic SSE response so the suite doesn't
 * hit Anthropic. Returns the number of intercepted calls so tests can assert
 * the endpoint was reached.
 */
export async function stubChat(
  page: Page,
  responseText = "This is a stubbed coach reply for E2E testing. Hip rotation drill, 100 reps daily."
) {
  const state = { calls: 0 };
  await page.route("**/api/chat", async (route: Route) => {
    state.calls += 1;
    // Emit a single text event + a done event — same shape as src/app/api/chat/route.ts
    const body =
      `data: ${JSON.stringify({ type: "text", content: responseText })}\n\n` +
      `data: ${JSON.stringify({ type: "done" })}\n\n`;
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
      body,
    });
  });

  // Most other APIs the tabs hit (/api/coach/progress, /api/coach/session, etc.)
  // aren't needed for happy-path smoke — return 204 so the UI just renders
  // its empty/default state.
  await page.route(/\/api\/(coach\/progress|coach\/session|feedback)(\?|$)/, async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"focusAreas":[],"neglected":[],"drillHistory":[]}' });
  });

  return state;
}
