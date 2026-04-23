"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AlexLandingPage() {
  const router = useRouter();

  // Navigate to the main app with the seeded question as a URL param. The home
  // page reads ?q=… on mount and fires it through the existing coachQuery flow,
  // which avoids re-mounting ChatTab with a prop-driven initialQuery (that
  // double-fires in React 19 StrictMode dev and aborts its own fetch).
  const handleStart = (query?: string) => {
    if (query) {
      router.push(`/?q=${encodeURIComponent(query)}`);
    } else {
      router.push("/");
    }
  };

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full">
        <div className="mb-4 flex items-center gap-2 text-xs text-muted">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" />
          <span>Private preview — not public yet</span>
        </div>

        <h1 className="mb-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          Hey Alex — this is built on your Blueprint.
        </h1>

        <p className="mb-4 text-base text-muted">
          I spent a few weeks turning the <em>Power Punching Blueprint</em> + your YouTube
          catalog into a retrieval-augmented coach. It teaches your framework —
          kinetic chains, the four phases, throw-not-push, last-three-knuckles — not
          generic boxing advice.
        </p>

        <p className="mb-6 text-base text-muted">
          Wanted to show it to you before pushing it anywhere visible. Try the
          seeded examples below or ask whatever you want.
        </p>

        <div className="mb-6 rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
            Try a question from your own content
          </div>
          <div className="grid grid-cols-1 gap-2">
            {[
              "Should I land a hook with my palm facing me or palm down?",
              "How does Beterbiev generate power?",
              "Why is pivoting on the ball of the front foot wrong for a hook?",
              "Explain shearing force and the last three knuckles.",
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleStart(q)}
                className="rounded-lg border border-border bg-background px-4 py-3 text-left text-sm hover:border-accent/40 hover:bg-surface-hover"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => handleStart()}
            className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Open the coach →
          </button>
          <Link
            href="/about"
            className="rounded-lg border border-border bg-surface px-6 py-3 text-center text-sm hover:bg-surface-hover"
          >
            What&rsquo;s in the vault (and what&rsquo;s missing)
          </Link>
        </div>

        <div className="border-t border-border pt-6 text-xs text-muted">
          <p className="mb-2">
            <strong>What to look for:</strong> does it sound like your framework?
            Does it hallucinate anything? Anything it gets subtly wrong that you
            would catch instantly? Those are the signals I want.
          </p>
          <p>
            There are four tabs once you&rsquo;re in — Technique (this is where
            the power-mechanics Q&amp;A lives), Drills (exercises and bag work),
            My Coach (log a training session, get follow-up), Find Your Style
            (pick matched fighters + a counter list).
          </p>
        </div>
      </div>
    </main>
  );
}
