"use client";

export function CoachProgress({ userId }: { userId: string }) {
  return (
    <div className="flex h-full items-center justify-center text-muted text-sm">
      My Progress — coming soon (user: {userId.slice(0, 8)}...)
    </div>
  );
}
