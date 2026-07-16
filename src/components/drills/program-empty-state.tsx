"use client";

import Link from "next/link";
import { Dumbbell } from "lucide-react";

type Props = {
  onSwitchTab?: (tabId: "style") => void;
};

export function ProgramEmptyState({ onSwitchTab }: Props) {
  return (
    <div className="relative z-10 px-4 py-7 sm:px-8 sm:py-10">
      <div className="grid overflow-hidden border border-ink/10 bg-surface/85 lg:grid-cols-[1fr_20rem]">
        <div className="p-7 sm:p-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ember">Program status / locked</p>
          <h3 className="mt-5 max-w-lg text-3xl font-semibold leading-[.96] tracking-[-0.05em] sm:text-4xl">Find your style first.</h3>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink/50 sm:text-base">
            Your rounds should match the fighter you are—not a generic workout list. Complete the style scan to unlock drills built around your strengths and gaps.
          </p>
          {onSwitchTab ? (
            <button onClick={() => onSwitchTab("style")} className="mt-8 border border-accent bg-accent px-5 py-3 font-mono text-xs font-medium uppercase tracking-wide text-white hover:bg-accent-hover">
              Run the style scan →
            </button>
          ) : (
            <Link href="/?tab=style" className="mt-8 inline-block border border-accent bg-accent px-5 py-3 font-mono text-xs font-medium uppercase tracking-wide text-white hover:bg-accent-hover">
              Run the style scan →
            </Link>
          )}
        </div>
        <div className="relative grid min-h-52 place-items-center overflow-hidden border-t border-ink/10 bg-surface-hover lg:border-l lg:border-t-0">
          <span className="absolute text-[11rem] font-black leading-none text-ink/[.025]">02</span>
          <div className="relative text-center">
            <span className="mx-auto grid h-20 w-20 place-items-center border border-accent/45 bg-accent/10 text-ember"><Dumbbell size={32} /></span>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink/35">Awaiting fighter ID</p>
          </div>
        </div>
      </div>
    </div>
  );
}
