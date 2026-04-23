"use client";

import { useState } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { ProfileView } from "@/components/profile/profile-view";

const USER_ID_LS_KEY = "punch-doctor-user-id";

function readOrCreateUserId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(USER_ID_LS_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(USER_ID_LS_KEY, id);
  }
  return id;
}

export default function MePage() {
  const [userId] = useState<string>(() => readOrCreateUserId());

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pt-4 pb-3 sm:px-6">
          <span className="text-xl" role="img" aria-label="Boxing glove">
            🥊
          </span>
          <h1 className="text-lg font-semibold leading-tight">Boxing Coach AI</h1>
        </div>
      </header>
      <main>
        <ErrorBoundary label="Profile">
          {userId && <ProfileView userId={userId} />}
        </ErrorBoundary>
      </main>
    </div>
  );
}
