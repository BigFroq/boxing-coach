"use client";

import type { ProfileResponse, ProfilePatch } from "./profile-types";

export async function fetchProfile(userId: string): Promise<ProfileResponse> {
  const res = await fetch(`/api/profile?userId=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  return (await res.json()) as ProfileResponse;
}

export async function saveProfilePatch(patch: ProfilePatch): Promise<void> {
  const res = await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Save failed (${res.status})`);
  }
}
