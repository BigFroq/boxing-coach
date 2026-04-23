"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";

interface Props {
  surface: "technique" | "drills" | "coach" | "style" | "clip_review" | "other";
  query?: string;
  response: string;
  userId?: string;
}

type State = "idle" | "submitting" | "submitted";

export function FeedbackWidget({ surface, query, response, userId }: Props) {
  const [state, setState] = useState<State>("idle");
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  const submit = async (r: "up" | "down", noteText?: string) => {
    if (state === "submitting" || state === "submitted") return;
    setState("submitting");
    setRating(r);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surface,
          rating: r,
          userId,
          query: query?.slice(0, 2000),
          responsePreview: response.slice(0, 500),
          note: noteText?.slice(0, 1000),
        }),
      });
    } catch {
      // Non-blocking — swallow and pretend it worked
    } finally {
      setState("submitted");
    }
  };

  const onThumbs = (r: "up" | "down") => {
    if (r === "down") {
      // Give the user a chance to say why before we submit
      setRating("down");
      setShowNote(true);
      return;
    }
    submit(r);
  };

  const onSubmitNote = () => {
    submit("down", note);
  };

  if (state === "submitted") {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Check size={12} aria-hidden="true" />
        <span>Thanks — recorded.</span>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>Useful?</span>
        <button
          type="button"
          onClick={() => onThumbs("up")}
          aria-label="Helpful"
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface hover:text-foreground disabled:opacity-40"
          disabled={state === "submitting"}
        >
          <ThumbsUp size={14} />
        </button>
        <button
          type="button"
          onClick={() => onThumbs("down")}
          aria-label="Not helpful"
          className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface hover:text-foreground disabled:opacity-40 ${
            rating === "down" ? "text-foreground" : ""
          }`}
          disabled={state === "submitting"}
        >
          <ThumbsDown size={14} />
        </button>
      </div>
      {showNote && rating === "down" && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What went wrong? (optional)"
            maxLength={500}
            className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={onSubmitNote}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface disabled:opacity-40"
            disabled={state === "submitting"}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
