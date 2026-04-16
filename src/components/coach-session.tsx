"use client";

export function CoachSession({ userId }: { userId: string }) {
  return (
    <div className="flex h-full items-center justify-center text-muted text-sm">
      Log Session — coming soon (user: {userId.slice(0, 8)}...)
    </div>
  );
}
