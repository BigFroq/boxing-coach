"use client";

import { User } from "lucide-react";
import { SavedIndicator } from "./saved-indicator";
import { initialsFrom } from "@/lib/profile-initials";
import type { ProfileIdentity, EditableProfileField } from "@/lib/profile-types";

type Props = {
  identity: ProfileIdentity;
  savedField: EditableProfileField | null;
  savedTrigger: number | null;
  onSave: (field: EditableProfileField, value: string) => void;
  errorByField: Partial<Record<EditableProfileField, string>>;
};

export function IdentityCard({ identity, savedField, savedTrigger, onSave, errorByField }: Props) {
  const initials = initialsFrom(identity.display_name);

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent font-semibold text-xl">
          {initials || <User size={24} aria-hidden />}
        </div>
        <div className="flex-1 space-y-3">
          <label className="block">
            <span className="flex items-center gap-2 text-xs text-muted mb-1">
              Name
              {savedField === "display_name" && <SavedIndicator trigger={savedTrigger} />}
            </span>
            <input
              type="text"
              defaultValue={identity.display_name ?? ""}
              maxLength={80}
              placeholder="Your name"
              onBlur={(e) => onSave("display_name", e.target.value)}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${
                errorByField.display_name ? "border-red-500" : "border-border"
              }`}
            />
            {errorByField.display_name && (
              <span className="text-xs text-red-500">{errorByField.display_name}</span>
            )}
          </label>
          <label className="block">
            <span className="flex items-center gap-2 text-xs text-muted mb-1">
              Email (optional)
              {savedField === "email" && <SavedIndicator trigger={savedTrigger} />}
            </span>
            <input
              type="email"
              defaultValue={identity.email ?? ""}
              maxLength={200}
              placeholder="you@example.com"
              onBlur={(e) => onSave("email", e.target.value)}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${
                errorByField.email ? "border-red-500" : "border-border"
              }`}
            />
            <span className="mt-1 block text-xs text-muted">
              We&apos;ll use this to recover your profile on another device later — not needed today.
            </span>
            {errorByField.email && (
              <span className="text-xs text-red-500">{errorByField.email}</span>
            )}
          </label>
        </div>
      </div>
    </section>
  );
}
