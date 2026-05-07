---
title: Plan 3a — Coach context refresh (provider pattern)
date: 2026-05-07
status: design approved, awaiting spec review
predecessor: Plan 2 (Compounding Clip Log) — shipped 2026-05-07, merged to main
fixes: known limitation flagged in Plan 2's final review (clipHistory stale until next page load)
upstream_design: docs/ideas/2026-05-07-floman-feedback-idea-map.md
---

# Plan 3a — Coach Context Refresh

## Goal

Fix Plan 2's known limitation: `clipHistory` is fetched once on `page.tsx` mount, so a user who logs a clip and immediately asks the coach won't have the new clip reflected in the trend block. Replace the static injection with a per-submit provider so the coach always sees the latest clip log.

This implements the architectural fix flagged in Plan 2's final review under "Open risks for production rollout — stale coach context."

## Success criteria

- After uploading a clip, the user can immediately submit a chat message in either the technique or drills tab and the coach's system prompt includes that just-logged clip in its trend block.
- The style-finder ChatTab (which uses `extraContext={{ styleProfile }}`) is unchanged — no regression in that path.
- Provider failures (network down, Supabase blip) do not break the chat submit. Worst case: coach answers without fresh clip context.
- Plan 2's existing test suite (232/232) continues to pass.

## Architecture

Two changes, no schema or API change.

### 1. `ChatTab` (`src/components/chat-tab.tsx`)

Add a new optional prop `extraContextProvider` alongside the existing static `extraContext`:

```ts
interface ChatTabProps {
  // ... existing fields ...
  extraContext?: Record<string, unknown>;
  extraContextProvider?: () => Promise<Record<string, unknown>>;
}
```

In the submit handler (currently around line 280, where `extraContext` is spread into the request body), call the provider first, then merge with static extraContext (provider wins on conflict):

```ts
let dynamicContext: Record<string, unknown> = {};
if (extraContextProvider) {
  try {
    dynamicContext = await extraContextProvider();
  } catch (err) {
    console.error("[chat-tab] extraContextProvider failed:", err);
    // Silent — chat submit must not break because of context fetch failure
  }
}

body: JSON.stringify({
  // ... existing fields ...
  ...(extraContext ?? {}),
  ...dynamicContext,
}),
```

The dependency array on the submit `useCallback` (currently includes `extraContext`) gets `extraContextProvider` added so that callback identity tracks both inputs.

### 2. `page.tsx` (`src/app/page.tsx`)

Remove the static `clipHistory` useState + the useEffect that fetches/aggregates on mount. Replace with a memoized async provider:

```tsx
const getClipHistory = useCallback(async (): Promise<Record<string, unknown>> => {
  if (!userId || userId === "anon") return {};
  const r = await fetchRecentClips(userId, 60);
  if (r.status !== "ok") return {};
  return { clipHistory: aggregateClipHistory(r.clips, new Date()) };
}, [userId]);
```

Pass to both technique + drills ChatTabs:

```tsx
<ChatTab ... extraContextProvider={getClipHistory} />
```

Drop the `extraContext={clipHistory ? { clipHistory } : undefined}` prop from these two call sites.

### 3. Style-finder ChatTab — unchanged

`src/components/style-finder/dashboard-view.tsx` keeps `extraContext={{ styleProfile }}`. The styleProfile is computed from local quiz state and doesn't need refreshing — static is correct there. Provider pattern is opt-in.

### 4. Backend — no changes

`/api/chat/route.ts` already accepts `clipHistory` from Plan 2 Task 10. The provider pattern is purely client-side.

## Tradeoffs / decisions baked in

- **One Supabase SELECT per chat submit.** ~50ms over the network on the indexed query. Acceptable: chat submits are user-paced (seconds apart), the index `idx_clip_logs_user_created` makes it cheap.
- **Provider wins on conflict with static extraContext.** Means a future feature could combine static + dynamic (e.g., styleProfile static + clipHistory dynamic). Not used today, but the abstraction supports it.
- **Provider failure is silent.** Logged via `console.error` + (optionally) PostHog `track`. The chat still sends with whatever static extraContext exists. The cost of being noisy here is making the user re-send their message; the cost of being silent is the coach occasionally missing fresh context. Silent wins.
- **No client-side cache.** Could memoize results for N seconds to avoid duplicate fetches if the user submits two messages quickly. Not worth v1 complexity — fetch is cheap.

## Components & data flow

```
[user uploads clip]
   │
   ▼
[coach-clip-review.tsx] → saveClipLog → DB write (Plan 2)
   │
   │ (no callback needed — page.tsx doesn't need notification)
   ▼
[user types in chat, hits submit]
   │
   ▼
[chat-tab.tsx submit handler]
   │
   ├─ await extraContextProvider() ──→ [page.tsx getClipHistory]
   │                                      │
   │                                      ▼
   │                               [fetchRecentClips → aggregateClipHistory]
   │
   └─ merge into request body ──→ POST /api/chat
                                       │
                                       ▼
                            [chat/route.ts formatClipHistory]
                                       │
                                       ▼
                            [Anthropic system prompt with fresh clip history]
```

The previously-required wiring `coach-clip-review → page.tsx [refreshClipHistory]` is **eliminated**. The provider pattern means we don't need to know when a new clip is logged — we just refetch at submit time.

## Error handling

| Path | Error | Behavior |
|---|---|---|
| `fetchRecentClips` returns `{status: "error"}` | Network or DB error | `getClipHistory` returns `{}`. Chat submits with no clipHistory. Coach falls back to pre-Plan-2 behavior. |
| Provider rejects (uncaught throw) | Bug in provider implementation | Caught by chat-tab's try/catch around the await. Logged. Chat proceeds with empty dynamic context. |
| `userId === "anon"` | User without identity | Provider returns `{}` immediately. No DB call. |

## Testing

**Unit tests:** None new required. The pure aggregation already has 9 tests (Plan 2). The chat-tab provider call is a thin async glue — mocking it would test the mock, not the behavior. Manual QA is the right gate.

**Manual QA (Task 4 of the Plan 3a implementation plan):**

1. **Fresh-clip-then-chat** — Log a new clip in My Coach → Clip Review. Immediately switch to the technique tab and ask "How is my form trending?" Verify the coach's answer references the just-logged clip qualitatively.
2. **Style-finder regression** — Open Find Your Style → dashboard chat. Verify it still works (static extraContext path).
3. **Network failure during provider** — DevTools → throttle to "Offline" briefly during chat submit. Verify chat submit either fails gracefully (not because of provider) or completes with no fresh clipHistory.
4. **No clips logged yet** — On a fresh user with zero clips, verify chat works (provider returns empty, coach behaves like pre-Plan-2).

## Out of scope

- **Refreshing on tab switch.** If the user switches tabs without logging a new clip, no refresh needed.
- **Caching/SWR-style invalidation.** Single-call fetch is cheap enough.
- **Provider for styleProfile.** Style data doesn't go stale within a session.
- **Backend chat-route changes.** Plan 2 Task 10 already handled the `clipHistory` schema field.
- **Component tests.** ChatTab is complex enough that adding a test to cover this single branch isn't cost-effective for a 2-day fix.

## Risks

1. **Race against in-flight saveClipLog at submit time.** If the user uploads a clip, types a chat message, and hits send WHILE `saveClipLog` is still resolving, the provider runs but the new clip may not yet be in the DB. Mitigation: not really mitigated — the user has to wait ~1-2s for the save round-trip. Acceptable: this is a corner case that's better than the previous "stale until page reload" baseline. If we wanted to fully eliminate, we could await `saveClipLog` from the chat submit, but that's heavy.
2. **ChatTab is a 700+ line component.** Modifying it carries some regression risk. Mitigation: small targeted change — add one prop, one branch in submit handler. Manual QA on style-finder verifies no regression.
3. **Provider runs even on chats that don't need fresh clip data.** A user asking "what's a jab?" still triggers a clip-history fetch. Wasted ~50ms. Acceptable cost.

## What's NOT in this plan

- Plan 3b (Today's drill) — separate plan
- Plan 3c (Reaction games) — separate plan
- Tagging clips, user notes, re-running old clips — Plan 4+

## What I'd want next

1. Spec review by Mark.
2. After approval, invoke `superpowers:writing-plans` to produce the implementation plan with task breakdown.
3. Execute via `superpowers:subagent-driven-development`.

Estimated effort: 2 tasks (one for ChatTab change, one for page.tsx change) + manual QA. ~2 days.
