# /me — personal profile page

**Status:** design approved, pending implementation plan
**Date:** 2026-04-23
**Branch:** feat/pre-outreach-prep (design only; implementation branch TBD)

## Summary

Add a personal profile page at `/me` that rolls up everything the app knows about a user — identity, Style Finder snapshot, My Coach snapshot — plus a small editable surface for self-reported training context and free-form notes. Reached via a small avatar button in the top-right header on every main-app tab.

## Goals

- Give each user one place to see "how you box" — a readable summary of their style, physical context, active coaching work, and self-reported training life.
- Let users add the things the quiz and coach don't ask for: gym, trainer, when they started, goals, free-form notes.
- Lay groundwork for a future "claim your profile with email" flow without standing up auth now.

## Non-goals (explicitly deferred)

- Supabase auth, magic links, or any real login flow.
- Merging two anonymous IDs when a user claims from a second device.
- A training journal or append-only "experiences" list (rejected Option C during brainstorming).
- Editing stance, height, reach, build, or experience level on `/me` — the Style Finder quiz remains the source of truth for those.
- Profile picture upload / any avatar beyond initials or a fallback icon.
- A public, shareable version of `/me` (the existing `/profile/[id]` shared-style-result route is separate and unchanged).

## Account model

Anonymous-first, same as the rest of the app. Users are identified by the UUID already stored in `localStorage` under `punch-doctor-user-id` by [src/app/page.tsx](src/app/page.tsx). The profile page operates on that ID. `email` on the profile is just a nullable text field with copy explaining it exists for future cross-device recovery — there's no magic-link flow in v1.

## Architecture

### Route

New client component at `src/app/me/page.tsx`. On mount:

1. Read the anonymous user ID from `localStorage`.
2. `GET /api/profile?userId=<id>` — returns a combined payload (see below).
3. Render sections; empty states for style / coach when the underlying tables are empty.

Back navigation uses the browser's default — no custom nav. The header on `/me` matches the main app (logo + "About & limitations" link; no tab nav since `/me` is not a tab).

### Header trigger (on the main app page)

[src/app/page.tsx](src/app/page.tsx) gets a small avatar button next to the existing "About & limitations" link:

- Circular, matches the existing accent / muted colors.
- Content: initials from `display_name` (first letter of first and last word, uppercase); if no name, a `User` icon from `lucide-react`.
- Wraps a `<Link href="/me">`.
- Reads `display_name` from `localStorage` key `punch-doctor-display-name` synchronously so the main app doesn't need a network roundtrip on every load just to render initials.
- Write path: the `/me` page writes to that localStorage key whenever `display_name` is saved, alongside the PATCH to the server.

### API

Two endpoints under `src/app/api/profile/`:

**`GET /api/profile?userId=<uuid>`**

Returns one combined shape:

```ts
type ProfileResponse = {
  identity: {
    display_name: string | null;
    email: string | null;
  };
  training_context: {
    gym: string | null;
    trainer: string | null;
    started_boxing_at: string | null; // ISO date (YYYY-MM-DD)
    goals: string | null;
  };
  notes: string | null;
  style_snapshot: {
    style_name: string;
    description: string;
    stance: string;
    experience_level: "beginner" | "intermediate" | "advanced";
    height: string;
    reach: string;
    build: string;
    top_fighters: Array<{ slug: string; name: string; match_pct: number }>;
    profile_id: string; // for deep-linking to /profile/[id]
  } | null; // null when no current style_profile exists
  coach_snapshot: {
    last_session_at: string | null; // ISO
    last_session_type: string | null;
    active_focus_areas: Array<{ id: string; name: string; status: string }>;
    active_focus_areas_total: number;
    recent_drills: Array<{ id: string; drill_name: string; followed_up: boolean; created_at: string }>;
  } | null; // null when no training_sessions, focus_areas, or drill_prescriptions exist
};
```

Server-side aggregation reads:

- `user_profiles` row where `id = userId` (may not exist; missing → identity/training_context/notes default to null).
- `style_profiles` where `user_id = userId AND is_current = true` — latest row only. Null if absent.
  - Top fighters come from `matched_fighters` jsonb, take first 3.
- `focus_areas` where `user_id = userId AND status IN ('new', 'active', 'improving')`, ordered by `updated_at DESC`. Take first 3; also return total count.
- `drill_prescriptions` where `user_id = userId`, order by `created_at DESC`. Take first 3.
- `training_sessions` where `user_id = userId`, order by `created_at DESC`. Take first 1 for `last_session_*`.

If all coach-related selects return empty, `coach_snapshot` is `null`.

**`PATCH /api/profile`**

Body:

```ts
type ProfilePatch = {
  userId: string;
  display_name?: string | null;
  email?: string | null;
  gym?: string | null;
  trainer?: string | null;
  started_boxing_at?: string | null;
  goals?: string | null;
  notes?: string | null;
};
```

Upserts into `user_profiles`. Only updates the fields present in the body. No partial write on other columns (`tendencies`, `skill_levels`, `preferences`) — leave existing values intact.

Validation:

- `email` if present: trim, basic shape check (contains `@`, not empty after trim); empty string → store as `null`.
- `display_name` if present: trim, max length 80, empty string → `null`.
- `gym` / `trainer`: trim, max length 80 each, empty → `null`.
- `started_boxing_at`: if present, must parse as `YYYY-MM` (the value emitted by `<input type="month">`) or `YYYY-MM-DD`. Server coerces `YYYY-MM` to `YYYY-MM-01` before storing. Invalid → 400.
- `goals`: max length 500.
- `notes`: max length 4000.

Returns the updated profile row.

### Schema

New migration `supabase/migrations/009_profile_fields.sql`:

```sql
ALTER TABLE user_profiles
  ADD COLUMN email text,
  ADD COLUMN gym text,
  ADD COLUMN trainer text,
  ADD COLUMN started_boxing_at date,
  ADD COLUMN goals text,
  ADD COLUMN notes text;
```

No new RLS needed — the existing `"Allow all on user_profiles"` policy from [003_coach_tables.sql](supabase/migrations/003_coach_tables.sql) matches the anonymous-first posture everywhere else in the app.

No new indexes — lookups are by `id` (the primary key).

### Deep-link support on the main app

Small addition to [src/app/page.tsx](src/app/page.tsx): on mount, read `?tab=<technique|drills|coach|style>` and set `activeTab` from it if present, then strip the param via `history.replaceState` — mirrors the existing `?q=` seed handling already in that file.

Used by the "Update via Style Finder →" link (→ `/?tab=style`) and "Open My Coach →" link (→ `/?tab=coach`) on `/me`.

## UI layout

Single-column, `max-w-2xl` centered, dark theme matching the main app. Sections in order:

### 1. Identity card

- Circular avatar tile on the left (initials from `display_name`, `User` icon fallback).
- `display_name` input (single line, autosave on blur, max 80).
- `email` input underneath with helper text: *"We'll use this to recover your profile on another device later — not needed today."*
- No "Save" button. Autosave on blur. Small "Saved" indicator fades after 1.5s next to each field after a successful PATCH.

### 2. Your style *(read-only, from `style_profiles`)*

- Style name as heading, one-sentence description below.
- Pill row: stance · experience level · height · reach · build.
- Top 3 matched fighters as chips (name + match %), same visual language as the existing style-finder results component.
- Footer link: *"Update via Style Finder →"* — deep-links to `/?tab=style`.
- **Empty state** when `style_snapshot` is `null`: muted card *"Take the Style Finder quiz to see a snapshot of how you box →"* linking to `/?tab=style`.

### 3. Your coaching *(read-only)*

- "Last session" line using the existing relative-time helper in [src/lib/](src/lib/) (e.g., "Last session: 3 days ago · bag work").
- Active focus areas — show up to 3, each with a status pill (`new` / `active` / `improving`). If `active_focus_areas_total > 3`, show a "+N more" chip.
- Recent drills — last 3 drill names as a small list; mark "✓ followed up" or "— not yet" next to each.
- Footer link: *"Open My Coach →"* → `/?tab=coach`.
- **Empty state** when `coach_snapshot` is `null`: *"Log your first session in My Coach to see progress here →"* linking to `/?tab=coach`.

### 4. Training context *(editable)*

- Gym (single-line input, max 80).
- Trainer (single-line input, max 80).
- Started boxing (`<input type="month">`; server stores as `YYYY-MM-01` date).
- Goals (textarea, ~3 lines, max 500).
- All autosave on blur, same "Saved" indicator as identity.

### 5. Notes *(editable)*

- Large free-form textarea, ~6 lines initially, grows with content (CSS `field-sizing: content` with a min-height fallback).
- Placeholder: *"Things about how you box — habits, injuries, what you're working on, anything."*
- Max 4000 chars; a subtle counter appears only when within 200 chars of the limit.
- Autosave on blur.

### Mobile

Same single column; horizontal padding drops from `px-6` to `px-4`. Identity avatar shrinks from 64px to 48px. Pill row on the style snapshot wraps naturally. No horizontal scroll anywhere. Matches the responsive behavior already established on [src/app/page.tsx](src/app/page.tsx).

### Error handling

- Each input has an error state (red border + small inline message) driven by response from `PATCH`. Reuses the visual language of the existing rate-limit UX in the chat routes.
- Wrap the whole page in the existing `<ErrorBoundary>` component (label: `"Profile"`).
- API errors log through Sentry like the rest of the app (already configured — [instrumentation.ts](instrumentation.ts), [sentry.server.config.ts](sentry.server.config.ts)).

## Analytics

PostHog, via the existing [src/lib/analytics](src/lib/) wrapper:

- `profile_viewed` — once, on mount of `/me`.
- `profile_field_saved` — once per successful field PATCH, with `{ field: 'display_name' | 'email' | 'gym' | 'trainer' | 'started_boxing_at' | 'goals' | 'notes' }`.
- `profile_deep_link_clicked` — with `{ target: 'style' | 'coach' }` when the footer links are clicked.

## File layout

```
src/
  app/
    me/
      page.tsx                     # new — client component, fetches + renders
    api/
      profile/
        route.ts                   # new — GET (aggregator) + PATCH (upsert)
    page.tsx                       # modified — add avatar header button, add ?tab= handling
  components/
    profile/
      profile-view.tsx             # new — root, owns state + autosave orchestration
      identity-card.tsx            # new
      style-snapshot.tsx           # new
      coach-snapshot.tsx           # new
      training-context-form.tsx    # new
      notes-form.tsx               # new
      saved-indicator.tsx          # new — small fade helper (shared by inputs)
  lib/
    profile-client.ts              # new — typed fetch wrapper for GET/PATCH
supabase/
  migrations/
    009_profile_fields.sql         # new
tests/
  e2e/
    profile.spec.ts                # new — Playwright smoke (desktop + mobile)
```

Each subcomponent stays small and single-purpose — the root `profile-view.tsx` owns the payload + save orchestration; subcomponents receive their slice as props and call a shared `onSave(field, value)` callback. Keeps every file under ~200 lines and lets each section be read and tested independently.

## Testing

**Playwright smoke** at `tests/e2e/profile.spec.ts`, desktop + mobile projects (matching the existing [playwright.config.ts](playwright.config.ts) projects):

1. Visit `/me` with no prior data → identity card shows empty, style + coach sections show empty states with working CTAs.
2. Type a display name → blur → reload → name persists.
3. Navigate back to `/` → header avatar shows the correct initials.
4. Type an email → blur → reload → email persists.
5. Type in gym/trainer/goals/notes → blur → reload → all persist.
6. (Mobile only) verify no horizontal scroll on any section.

**Unit tests** for the `GET /api/profile` aggregator under `src/app/api/profile/`:

- User with no rows anywhere → identity/training_context/notes fields all null, `style_snapshot === null`, `coach_snapshot === null`.
- User with only `style_profiles.is_current = true` → `style_snapshot` populated, `coach_snapshot === null`.
- User with quiz + coach activity → both snapshots populated, `recent_drills` and `active_focus_areas` capped at 3, `active_focus_areas_total` reflects true count.

**Unit tests** for the `PATCH /api/profile` handler:

- Empty-string inputs for optional fields collapse to `null`.
- `email` without `@` → 400.
- `goals > 500 chars` → 400.
- `notes > 4000 chars` → 400.
- Partial PATCH does not clobber columns outside the request body.

## Privacy note

`/me` is not shareable. Anyone who knows a user's anonymous UUID can request `/api/profile?userId=…` and see the returned payload — identical to the existing posture for `/api/coach` and other anon-scoped routes in the app. No new risk is introduced; worth a one-line callout when the anon model eventually hardens.

## Rollout

One branch, one PR. Migration `009` runs on deploy. No feature flag — the header avatar ships visible for all users. Existing `/profile/[id]` shared-style-result route is untouched; the two routes coexist under the `profile` URL namespace intentionally (one is "your private rollup," the other is "a shared fighter-style result").

## Open questions

None at spec-write time. If the "Update via Style Finder →" / "Open My Coach →" deep-link pattern proves awkward (e.g., the quiz restarts from scratch rather than picking up where the user left off), revisit — but that's a follow-up UX issue, not a spec-blocking one.
