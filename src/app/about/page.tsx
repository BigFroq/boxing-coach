import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Punch Doctor AI",
  description: "What's in the knowledge base, how the coach works, and what it can't do yet.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <nav className="mb-8">
        <Link
          href="/"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Back to the coach
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="mb-3 text-3xl font-semibold">About this coach</h1>
        <p className="text-muted">
          An AI boxing coach built on Dr. Alex Wiant&rsquo;s{" "}
          <em>Power Punching Blueprint</em> and his Punch Doctor YouTube
          catalog. Radically specific about what it knows &mdash; and what it
          doesn&rsquo;t.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">What&rsquo;s in the vault</h2>
        <p className="mb-4 text-sm">
          The coach answers from a retrieval-augmented knowledge base built
          from two sources:
        </p>
        <ul className="mb-4 list-disc space-y-2 pl-6 text-sm">
          <li>
            <strong>Power Punching Blueprint</strong> (PDF) &mdash; 15 chapters
            on power mechanics, the four phases, kinetic chains, shearing
            force, hand wrapping, bag work, and per-punch breakdowns.
          </li>
          <li>
            <strong>Punch Doctor YouTube transcripts</strong> &mdash; 98 of
            99 videos, roughly 1.2M characters of transcript ingested. One
            video failed to fetch (subtitles disabled on the source).
          </li>
        </ul>
        <p className="mb-4 text-sm">
          The ingested sources are distilled into six synthesized note types:
          <strong> 100 concepts</strong>, <strong>37 techniques</strong>,{" "}
          <strong>12 phases</strong>, <strong>73 fighter profiles</strong>,{" "}
          <strong>42 drills</strong>, and <strong>23 injury-prevention notes</strong>. The fighter roster spans boxing, muay thai, and MMA &mdash;
          it feeds the Style Finder as well as the coach. Each note is
          cross-linked, so a question about the jab can surface the Jab
          technique page, the Hip Rotation concept, the Four Phases breakdown,{" "}
          <em>and</em> the Canelo fighter analysis in a single retrieval.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">How retrieval works</h2>
        <p className="mb-3 text-sm">
          When you ask a question:
        </p>
        <ol className="mb-4 list-decimal space-y-2 pl-6 text-sm">
          <li>
            The coach decomposes your question into sub-queries &mdash; so
            &ldquo;compare Canelo&rsquo;s jab to Crawford&rsquo;s&rdquo; becomes two
            separate retrievals instead of one fuzzy one.
          </li>
          <li>
            Each sub-query runs <strong>vector search</strong> (semantic
            similarity against embedded chunks) <em>and</em>{" "}
            <strong>graph traversal</strong> (following cross-links between
            notes) in parallel.
          </li>
          <li>
            Results are reranked for relevance and passed to Claude along with
            a system prompt that enforces Alex&rsquo;s methodology &mdash;
            not generic boxing advice.
          </li>
        </ol>
        <p className="text-sm text-muted">
          The coach is instructed not to cite video titles or course chapters
          by name &mdash; the goal is to teach the mechanics directly, not to
          namedrop sources.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Known limitations</h2>
        <p className="mb-4 text-sm">
          The coach has blind spots. Better to name them than pretend they
          don&rsquo;t exist.
        </p>
        <ul className="list-disc space-y-3 pl-6 text-sm">
          <li>
            <strong>No women&rsquo;s boxing.</strong> Zero women&rsquo;s
            fighter profiles in the vault right now. Claressa Shields, Katie
            Taylor, Amanda Serrano &mdash; the coach will give you general
            mechanics, not specific analyses.
          </li>
          <li>
            <strong>No amateur / Olympic content.</strong> The source material
            is pro-focused. Headgear, point scoring, and amateur tactics
            aren&rsquo;t covered.
          </li>
          <li>
            <strong>~73 profiled fighters &mdash; but not every name.</strong>{" "}
            Ask about Tszyu or Benavidez and the coach falls back to general
            principles. It won&rsquo;t fabricate a fight analysis.
          </li>
          <li>
            <strong>Nutrition, weight cutting, cardio programming.</strong>{" "}
            Not Alex&rsquo;s focus. Expect general-knowledge answers, not
            Blueprint-backed ones.
          </li>
          <li>
            <strong>Clip Review works on short clips, not live video.</strong>{" "}
            Upload a short clip &mdash; best filmed side-on, one punch at a
            time &mdash; and it samples up to 80 frames (as dense as ~30fps on
            a 3-second clip) to score the four phases and read
            hip-vs-shoulder-vs-hand sequencing, with a pose skeleton drawn on
            each frame. It can&rsquo;t watch a live feed or a full sparring
            round, and accuracy drops on long multi-punch clips where each
            punch gets fewer frames. When it misjudges a score, your correction
            calibrates future analyses.
          </li>
          <li>
            <strong>Defense as a standalone topic.</strong> Defensive
            fundamentals show up inside fighter analyses (Mayweather, Bivol)
            rather than in a dedicated cluster.
          </li>
          <li>
            <strong>New videos lag.</strong> Anything Alex has posted since
            the ingestion run isn&rsquo;t in here yet.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Where mistakes can still happen</h2>
        <p className="mb-3 text-sm">
          Even on topics the vault covers deeply, a retrieval-augmented coach
          can drift. On internal evaluations, the coach is accurate ~95% of
          the time on questions drawn from the Blueprint &mdash; but that
          means ~1 in 20 answers still misses a nuance. Use it like you would
          any coach: a force multiplier, not a replacement for a real one.
        </p>
      </section>

      <footer className="border-t border-border pt-6 text-xs text-muted">
        <p>
          Built on Dr. Alex Wiant&rsquo;s Power Punching Blueprint and his
          Punch Doctor YouTube content.
        </p>
      </footer>
    </main>
  );
}
