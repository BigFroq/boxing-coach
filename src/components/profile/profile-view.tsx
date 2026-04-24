"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchProfile, saveProfilePatch } from "@/lib/profile-client";
import { track } from "@/lib/analytics";
import type {
  EditableProfileField,
  ProfileResponse,
} from "@/lib/profile-types";
import { IdentityCard } from "./identity-card";
import { StyleSnapshot } from "./style-snapshot";
import { CoachSnapshot } from "./coach-snapshot";
import { TrainingContextForm } from "./training-context-form";
import { NotesForm } from "./notes-form";

const DISPLAY_NAME_LS_KEY = "punch-doctor-display-name";

type Status = "loading" | "ready" | "error";

export function ProfileView({ userId }: { userId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [savedField, setSavedField] = useState<EditableProfileField | null>(null);
  const [savedTrigger, setSavedTrigger] = useState<number | null>(null);
  const [errorByField, setErrorByField] = useState<
    Partial<Record<EditableProfileField, string>>
  >({});

  useEffect(() => {
    let cancelled = false;
    fetchProfile(userId)
      .then((res) => {
        if (cancelled) return;
        setProfile(res);
        setStatus("ready");
        track("profile_viewed");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function onSave(field: EditableProfileField, rawValue: string) {
    const current = currentValueFor(profile, field);
    const next = rawValue.trim();
    // Skip no-ops (both empty or identical after trim).
    if ((current ?? "") === next) return;

    try {
      await saveProfilePatch({ userId, [field]: next });
      setErrorByField((prev) => {
        const clone = { ...prev };
        delete clone[field];
        return clone;
      });
      setProfile((prev) => (prev ? applyPatch(prev, field, next) : prev));
      setSavedField(field);
      setSavedTrigger(Date.now());
      track("profile_field_saved", { field });

      if (field === "display_name" && typeof window !== "undefined") {
        if (next === "") window.localStorage.removeItem(DISPLAY_NAME_LS_KEY);
        else window.localStorage.setItem(DISPLAY_NAME_LS_KEY, next);
      }
    } catch (err) {
      setErrorByField((prev) => ({
        ...prev,
        [field]: err instanceof Error ? err.message : "Save failed",
      }));
    }
  }

  if (status === "loading" || !profile) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        Loading your profile…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        Couldn&apos;t load profile. Refresh to try again.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your profile</h1>
        <Link
          href="/"
          className="text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Back to the coach
        </Link>
      </div>

      <IdentityCard
        identity={profile.identity}
        savedField={savedField}
        savedTrigger={savedTrigger}
        onSave={onSave}
        errorByField={errorByField}
      />

      <StyleSnapshot snapshot={profile.style_snapshot} />

      <CoachSnapshot snapshot={profile.coach_snapshot} />

      <TrainingContextForm
        context={profile.training_context}
        savedField={savedField}
        savedTrigger={savedTrigger}
        onSave={onSave}
        errorByField={errorByField}
      />

      <NotesForm
        notes={profile.notes}
        savedField={savedField}
        savedTrigger={savedTrigger}
        onSave={onSave}
        errorByField={errorByField}
      />
    </div>
  );
}

function currentValueFor(profile: ProfileResponse | null, field: EditableProfileField): string | null {
  if (!profile) return null;
  switch (field) {
    case "display_name":
      return profile.identity.display_name;
    case "email":
      return profile.identity.email;
    case "gym":
      return profile.training_context.gym;
    case "trainer":
      return profile.training_context.trainer;
    case "started_boxing_at":
      return profile.training_context.started_boxing_at;
    case "goals":
      return profile.training_context.goals;
    case "notes":
      return profile.notes;
  }
}

function applyPatch(
  profile: ProfileResponse,
  field: EditableProfileField,
  value: string
): ProfileResponse {
  const cleaned = value === "" ? null : value;
  const storedDate =
    field === "started_boxing_at" && cleaned && /^\d{4}-\d{2}$/.test(cleaned)
      ? `${cleaned}-01`
      : cleaned;

  switch (field) {
    case "display_name":
      return { ...profile, identity: { ...profile.identity, display_name: cleaned } };
    case "email":
      return { ...profile, identity: { ...profile.identity, email: cleaned } };
    case "gym":
      return { ...profile, training_context: { ...profile.training_context, gym: cleaned } };
    case "trainer":
      return { ...profile, training_context: { ...profile.training_context, trainer: cleaned } };
    case "started_boxing_at":
      return {
        ...profile,
        training_context: { ...profile.training_context, started_boxing_at: storedDate },
      };
    case "goals":
      return { ...profile, training_context: { ...profile.training_context, goals: cleaned } };
    case "notes":
      return { ...profile, notes: cleaned };
  }
}
