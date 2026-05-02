"use client";

import Link from "next/link";
import { Dumbbell } from "lucide-react";

export function ProgramEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center">
      <div className="rounded-2xl bg-surface-hover p-8 max-w-sm w-full space-y-4">
        <Dumbbell className="mx-auto h-10 w-10 text-muted" />
        <h2 className="text-base font-semibold">Find your style first</h2>
        <p className="text-sm text-muted leading-relaxed">
          Your drill program is tailored to your fighting style profile. Complete the style quiz
          to unlock drills matched to your strengths.
        </p>
        <Link
          href="/?tab=style"
          className="inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
        >
          Take the style quiz
        </Link>
      </div>
    </div>
  );
}
