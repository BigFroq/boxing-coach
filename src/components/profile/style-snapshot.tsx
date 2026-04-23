"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";
import type { ProfileStyleSnapshot } from "@/lib/profile-types";

function onStyleDeepLinkClick() {
  track("profile_deep_link_clicked", { target: "style" });
}

export function StyleSnapshot({ snapshot }: { snapshot: ProfileStyleSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold mb-2">Your style</h2>
        <p className="text-sm text-muted mb-3">
          Take the Style Finder quiz to see a snapshot of how you box.
        </p>
        <Link
          href="/?tab=style"
          onClick={onStyleDeepLinkClick}
          className="text-sm text-accent hover:underline underline-offset-2"
        >
          Open Style Finder →
        </Link>
      </section>
    );
  }

  const pills = [
    { label: "stance", value: snapshot.stance },
    { label: "experience", value: snapshot.experience_level },
    { label: "height", value: snapshot.height },
    { label: "reach", value: snapshot.reach },
    { label: "build", value: snapshot.build },
  ].filter((p) => p.value);

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold mb-1">Your style</h2>
      <p className="text-lg font-medium">{snapshot.style_name}</p>
      {snapshot.description && (
        <p className="text-sm text-muted mt-1">{snapshot.description}</p>
      )}

      {pills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pills.map((p) => (
            <span
              key={p.label}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted"
            >
              {p.label}: <span className="text-foreground">{p.value}</span>
            </span>
          ))}
        </div>
      )}

      {snapshot.top_fighters.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-muted mb-1">Top matched fighters</p>
          <div className="flex flex-wrap gap-2">
            {snapshot.top_fighters.map((f) => (
              <span
                key={f.slug}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                {f.name} <span className="text-muted">· {f.match_pct}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <Link
          href="/?tab=style"
          onClick={onStyleDeepLinkClick}
          className="text-sm text-accent hover:underline underline-offset-2"
        >
          Update via Style Finder →
        </Link>
      </div>
    </section>
  );
}
