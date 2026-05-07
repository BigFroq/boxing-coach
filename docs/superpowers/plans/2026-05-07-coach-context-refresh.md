# Coach Context Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `page.tsx`'s static `clipHistory` injection with a per-submit async provider on `ChatTab`, so the coach always sees the latest clip log when the user submits a chat message.

**Architecture:** Two-file change. (1) `ChatTab` accepts a new optional `extraContextProvider?: () => Promise<Record<string, unknown>>` prop, awaits it before each submit, merges with static `extraContext`. (2) `page.tsx` swaps its static useState/useEffect for a memoized `useCallback` provider that fetches + aggregates clip history on demand. No backend, no schema, no API changes.

**Tech Stack:** Next.js (App Router) · React · existing Plan 2 helpers (`fetchRecentClips`, `aggregateClipHistory`).

**Spec:** [docs/superpowers/specs/2026-05-07-coach-context-refresh-design.md](../specs/2026-05-07-coach-context-refresh-design.md)

**Project uses npm.** Use `npm test`, `npx tsc --noEmit`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/components/chat-tab.tsx` | Modify | Add `extraContextProvider` prop; await + merge in submit handler |
| `src/app/page.tsx` | Modify | Replace static `clipHistory` state with memoized `getClipHistory` provider; pass to both ChatTab instances |

No new files. No tests added (manual QA gates this — see Task 3). Style-finder ChatTab in `src/components/style-finder/dashboard-view.tsx` is unchanged (continues to use static `extraContext={{ styleProfile }}`).

---

## Task 1: Add `extraContextProvider` to ChatTab

**File:** `src/components/chat-tab.tsx`

### Step 1: Add the prop to the interface

Find the `ChatTabProps` interface (around line 27-39). Add `extraContextProvider` after the existing `extraContext` line. The interface should now include:

```ts
interface ChatTabProps {
  systemContext: string;
  placeholder: string;
  suggestions: Suggestion[];
  initialQuery?: string;
  heroIcon: SuggestionIcon;
  heroTitle: string;
  heroSubtitle: string;
  extraContext?: Record<string, unknown>;
  extraContextProvider?: () => Promise<Record<string, unknown>>;
  storageKeyOverride?: string;
  userId?: string;
}
```

(Match the surrounding fields exactly — only the new `extraContextProvider` line is added.)

### Step 2: Destructure the new prop in the function signature

In the `ChatTab` function declaration (around line 62-73), add `extraContextProvider` to the destructured props after `extraContext`:

```tsx
export function ChatTab({
  systemContext,
  placeholder,
  suggestions,
  initialQuery,
  heroIcon: HeroIcon,
  heroTitle,
  heroSubtitle,
  extraContext,
  extraContextProvider,
  storageKeyOverride,
  userId,
}: ChatTabProps) {
```

### Step 3: Await the provider before sending in the submit handler

Find the fetch call in the submit handler (around line 268-282). Currently the body merges `...(extraContext ?? {})`. Replace the `try { const res = await fetch(...)` block by awaiting the provider FIRST, then merging both static + dynamic context (provider wins on conflict):

The current block:

```tsx
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: newMessages
            .filter((m) => !m.error)
            .map((m) => ({ role: m.role, content: m.content })),
          context: systemContext,
          thinkLonger,
          userId,
          ...(extraContext ?? {}),
        }),
      });
```

Replace with:

```tsx
    let dynamicContext: Record<string, unknown> = {};
    if (extraContextProvider) {
      try {
        dynamicContext = await extraContextProvider();
      } catch (err) {
        // Silent — chat submit must not break because of context fetch failure.
        // Coach falls back to whatever static extraContext was passed.
        console.error("[chat-tab] extraContextProvider failed:", err);
      }
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: newMessages
            .filter((m) => !m.error)
            .map((m) => ({ role: m.role, content: m.content })),
          context: systemContext,
          thinkLonger,
          userId,
          ...(extraContext ?? {}),
          ...dynamicContext,
        }),
      });
```

The `dynamicContext` resolution lives OUTSIDE the inner `try` (which wraps the fetch). The provider's own `try/catch` makes its failure silent; the outer fetch `try/catch` is unchanged.

### Step 4: Add `extraContextProvider` to the submit useCallback's dependency array

Find the closing of the submit `useCallback` (around line 470). It currently looks like:

```tsx
}, [messages, loading, streaming, systemContext, thinkLonger, extraContext, userId, stopTypewriter]);
```

Change to add `extraContextProvider`:

```tsx
}, [messages, loading, streaming, systemContext, thinkLonger, extraContext, extraContextProvider, userId, stopTypewriter]);
```

### Step 5: Type-check

Run: `npx tsc --noEmit`
Expected: clean.

### Step 6: Run full test suite

Run: `npm test`
Expected: 232/232 pass — no test asserts on the chat-tab submit body, so this is additive.

### Step 7: Commit

```bash
git add src/components/chat-tab.tsx
git commit -m "feat(chat-tab): accept extraContextProvider for per-submit dynamic context"
```

---

## Task 2: Use the provider from `page.tsx`

**File:** `src/app/page.tsx`

**Goal:** Remove the static `clipHistory` state + mount-time fetch effect (added in Plan 2 Task 11), replace with a memoized async `getClipHistory` provider, pass to both technique + drills ChatTabs.

### Step 1: Update imports

In `src/app/page.tsx`, find the existing imports for clip log (added in Plan 2 Task 11):

```tsx
import { fetchRecentClips } from "@/lib/clip-log-storage";
import { aggregateClipHistory } from "@/lib/clip-log-aggregation";
import type { ClipHistoryContext } from "@/lib/clip-log-types";
```

Remove the `import type { ClipHistoryContext }` line — it's no longer used (the provider returns `Record<string, unknown>` matching the ChatTab prop signature, not the typed `ClipHistoryContext`). Keep `fetchRecentClips` and `aggregateClipHistory`.

Also: ensure `useCallback` is in the React imports. Find the existing `import { useEffect, useState } from "react";` line and add `useCallback`:

```tsx
import { useCallback, useEffect, useState } from "react";
```

### Step 2: Remove the static `clipHistory` state and fetch effect

Find the `clipHistory` useState declaration and the useEffect that fetches/aggregates on mount (added in Plan 2 Task 11). The block looks like:

```tsx
  const [clipHistory, setClipHistory] = useState<ClipHistoryContext | null>(null);

  useEffect(() => {
    if (!userId || userId === "anon") return;
    let cancelled = false;
    (async () => {
      const r = await fetchRecentClips(userId, 60);
      if (cancelled) return;
      if (r.status === "ok") {
        setClipHistory(aggregateClipHistory(r.clips, new Date()));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
```

**Delete the entire block** (the useState declaration plus the entire useEffect). It's replaced by Step 3.

### Step 3: Add the memoized provider

In the same location where the deleted block was (or anywhere among the other useCallback/useEffect declarations in `AppContent`), add:

```tsx
  const getClipHistory = useCallback(async (): Promise<Record<string, unknown>> => {
    if (!userId || userId === "anon") return {};
    const r = await fetchRecentClips(userId, 60);
    if (r.status !== "ok") return {};
    return { clipHistory: aggregateClipHistory(r.clips, new Date()) };
  }, [userId]);
```

This function will be referenced by both ChatTab instances. Memoization on `[userId]` keeps it referentially stable so the ChatTab submit useCallback doesn't churn unnecessarily.

### Step 4: Update the technique ChatTab call site

Find the technique ChatTab JSX (around line 152-167). It currently has:

```tsx
              extraContext={clipHistory ? { clipHistory } : undefined}
```

Change to:

```tsx
              extraContextProvider={getClipHistory}
```

### Step 5: Update the drills ChatTab call site

Find the drills ChatTab JSX (around line 180-194). It also has:

```tsx
                extraContext={clipHistory ? { clipHistory } : undefined}
```

Change to:

```tsx
                extraContextProvider={getClipHistory}
```

### Step 6: Type-check

Run: `npx tsc --noEmit`
Expected: clean. (TypeScript will catch if `getClipHistory` doesn't match the new ChatTab prop signature.)

### Step 7: Run full test suite

Run: `npm test`
Expected: 232/232 pass.

### Step 8: Commit

```bash
git add src/app/page.tsx
git commit -m "feat(chat): use clipHistory provider for per-submit freshness"
```

---

## Task 3: End-to-end manual QA

**Goal:** Verify the provider pattern actually delivers fresh clip context on submit, AND that the style-finder regression-tests clean.

This is human-gated. The provider call is a thin async glue layer; mocking it in a unit test would test the mock, not the behavior.

- [ ] **Step 1: Setup**

Run the app locally: `npm run dev`. Open the app at `localhost:3000` (or wherever the dev server lands).

- [ ] **Step 2: Fresh-clip-then-chat scenario**

1. Navigate to **My Coach → Clip Review**.
2. Upload and analyze a short boxing clip (≤40s).
3. Wait for the analysis result to render.
4. **Without reloading the page**, switch to the **Technique** tab.
5. Send a chat message: "How's my form trending?" or "What should I work on next?"
6. Open DevTools → Network tab.
7. Inspect the `POST /api/chat` request body. Verify it includes a `clipHistory` field with the just-uploaded clip's data:
   - `totalClips` includes the new clip
   - If you have ≥10 clips logged, the `trend` block reflects the latest scores
   - `mostRecent.daysAgo` is `0` (today) and `summary` matches the new clip's summary
8. Verify the coach's response qualitatively references the new clip. Example: "Your hip rotation in this most recent clip…" — the coach should not behave as if the clip is invisible.

- [ ] **Step 3: Style-finder regression**

1. Navigate to **Find Your Style**.
2. If you don't have a style profile, go through the quiz to create one.
3. On the dashboard, send a chat message in the style chat (e.g., "Why did you match me with these fighters?").
4. Verify it works as before. The request body should include `styleProfile` (static) and **not** `clipHistory` (no provider on this ChatTab).

- [ ] **Step 4: No clips logged scenario**

1. In a fresh browser profile (clear localStorage), open the app.
2. Without uploading any clips, go to the Technique tab and send a chat message.
3. Verify the chat works (no errors).
4. Verify the request body includes either no `clipHistory` field or `clipHistory: { windowDays: 14, totalClips: 0 }` (the empty aggregation result). The coach should respond normally without referencing a clip log.

- [ ] **Step 5: Network failure during provider scenario**

1. With at least one clip logged, open DevTools → Network and throttle to "Offline."
2. Send a chat message.
3. Expected: the chat fetch itself will fail (request can't reach the server). That's expected — the provider failing should not be the cause.
4. Switch back to "Online" and retry. The chat should send successfully.
5. (Stretch test) If you can simulate the provider failing while the chat fetch succeeds — e.g., by adding a temporary `throw` inside `getClipHistory` for testing — verify that the chat still sends with no `clipHistory` field, the coach responds normally, and a `[chat-tab] extraContextProvider failed:` log appears in the console.

- [ ] **Step 6: Document outcomes**

Append a `## Verification` section to this plan file noting the date, scenarios tested, and any deviations or surprises.

---

## Self-Review (before executing)

### Spec coverage
- Spec §1 (ChatTab prop + submit-handler change) → Task 1 ✅
- Spec §2 (page.tsx replace static state with memoized provider) → Task 2 ✅
- Spec §3 (style-finder unchanged) → covered by NOT touching `dashboard-view.tsx`; verified in Task 3 Step 3 ✅
- Spec §4 (no backend changes) → no backend tasks in this plan ✅
- Spec error-handling rows (provider rejects → silent log; userId=anon → empty record) → covered in Task 1 Step 3 + Task 2 Step 3 ✅
- Spec testing section (no unit tests, manual QA only) → Task 3 ✅

### Placeholder scan
No "TBD"/"TODO"/"add appropriate error handling". Every code block is complete.

### Type consistency
- `extraContextProvider?: () => Promise<Record<string, unknown>>` — same signature in Task 1 (interface) and Task 2 (the `getClipHistory` return type matches `Promise<Record<string, unknown>>`).
- `getClipHistory` referenced in Task 2 Step 3 (definition) and Steps 4 + 5 (call sites).

---

## Out of scope

- Caching/SWR-style invalidation
- Provider abstraction for `styleProfile` (static is correct there)
- Backend chat-route changes
- Plan 3b (Today's drill) — separate plan
- Plan 3c (Reaction games) — separate plan
- Refreshing on tab switch (provider runs at submit time only — sufficient)

---

## Notes for the executing engineer

- The codebase uses **Vitest** and **npm**. Run with `npm test` (full) or `npm test -- <path>` (single file).
- `chat-tab.tsx` is a 700+ line file. Stay surgical — only the prop, destructure, submit handler block, and dependency array change.
- The provider must be called BEFORE the inner fetch's `try { ... }` so its failure is caught by its own try/catch (not the fetch's try/catch).
- The merge order matters: `...(extraContext ?? {}), ...dynamicContext` means dynamic wins on conflict. Don't reverse it.
- `style-finder/dashboard-view.tsx` is the canonical static-extraContext consumer — verify it still works after Task 2.
- AGENTS.md says: this Next.js version may have breaking changes. You're not introducing new Next.js APIs.
