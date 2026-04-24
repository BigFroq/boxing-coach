"use client";

import Link from "next/link";
import { formatRelativeTime } from "@/lib/relative-time";
import { track } from "@/lib/analytics";
import type { ProfileCoachSnapshot } from "@/lib/profile-types";

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400",
  active: "bg-amber-500/10 text-amber-400",
  improving: "bg-emerald-500/10 text-emerald-400",
};

function onCoachDeepLinkClick() {
  track("profile_deep_link_clicked", { target: "coach" });
}

export function CoachSnapshot({ snapshot }: { snapshot: ProfileCoachSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold mb-2">Your coaching</h2>
        <p className="text-sm text-muted mb-3">
          Log your first session in My Coach to see progress here.
        </p>
        <Link
          href="/?tab=coach"
          onClick={onCoachDeepLinkClick}
          className="text-sm text-accent hover:underline underline-offset-2"
        >
          Open My Coach →
        </Link>
      </section>
    );
  }

  const extraFocusAreas = Math.max(0, snapshot.active_focus_areas_total - snapshot.active_focus_areas.length);

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold mb-3">Your coaching</h2>

      <p className="text-sm text-muted mb-3">
        Last session:{" "}
        <span className="text-foreground">{formatRelativeTime(snapshot.last_session_at)}</span>
        {snapshot.last_session_type && (
          <span className="text-muted"> · {snapshot.last_session_type.replace(/_/g, " ")}</span>
        )}
      </p>

      {snapshot.active_focus_areas.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-muted mb-1">Active focus areas</p>
          <div className="flex flex-wrap gap-2">
            {snapshot.active_focus_areas.map((f) => (
              <span
                key={f.id}
                className={`rounded-md px-2 py-1 text-xs ${STATUS_STYLES[f.status] ?? "bg-muted/10 text-muted"}`}
              >
                {f.name}
              </span>
            ))}
            {extraFocusAreas > 0 && (
              <span className="rounded-md border border-border px-2 py-1 text-xs text-muted">
                +{extraFocusAreas} more
              </span>
            )}
          </div>
        </div>
      )}

      {snapshot.recent_drills.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-muted mb-1">Recent drills</p>
          <ul className="space-y-1 text-sm">
            {snapshot.recent_drills.map((d) => (
              <li key={d.id} className="flex items-center justify-between">
                <span>{d.drill_name}</span>
                <span className="text-xs text-muted">
                  {d.followed_up ? "✓ followed up" : "— not yet"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href="/?tab=coach"
        onClick={onCoachDeepLinkClick}
        className="text-sm text-accent hover:underline underline-offset-2"
      >
        Open My Coach →
      </Link>
    </section>
  );
}
