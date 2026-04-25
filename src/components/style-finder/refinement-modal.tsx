"use client";

import { useState } from "react";
import { X, ChevronRight } from "lucide-react";
import { allQuestions } from "@/data/questions";
import type { Question } from "@/data/questions";

interface RefinementModalProps {
  questionIds: string[];
  onSubmit: (newAnswers: Record<string, string | string[] | number>) => void;
  onClose: () => void;
}

function getQuestion(id: string): Question | undefined {
  return allQuestions.find((q) => q.id === id);
}

export function RefinementModal({
  questionIds,
  onSubmit,
  onClose,
}: RefinementModalProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
  const [index, setIndex] = useState(0);

  const questions = questionIds
    .map(getQuestion)
    .filter((q): q is Question => q !== undefined);

  const total = questions.length;
  const current = questions[index];
  const isLast = index === total - 1;
  const allAnswered = questions.every((q) => q.id in answers);

  if (total === 0) {
    // Defensive — should not be opened with an empty list.
    return null;
  }

  function chooseSingle(qId: string, value: string) {
    const next = { ...answers, [qId]: value };
    setAnswers(next);
    if (!isLast) {
      setTimeout(() => setIndex((i) => i + 1), 200);
    }
  }

  function toggleMulti(qId: string, value: string, max: number) {
    const cur = (answers[qId] as string[] | undefined) ?? [];
    let next: string[];
    if (cur.includes(value)) {
      next = cur.filter((v) => v !== value);
    } else if (cur.length < max) {
      next = [...cur, value];
    } else {
      return;
    }
    setAnswers({ ...answers, [qId]: next });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Refine your profile"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-surface border border-border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Refine your profile</h2>
            <p className="text-xs text-muted mt-0.5">
              Question {index + 1} of {total}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-border p-1 hover:bg-background"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm font-medium mb-3">{current.question}</p>
        {current.honestPrompt && (
          <p className="text-xs text-muted italic mb-3">{current.honestPrompt}</p>
        )}

        <div className="space-y-2 mb-4">
          {current.format === "multiselect"
            ? current.options.map((opt) => {
                const cur = (answers[current.id] as string[] | undefined) ?? [];
                const checked = cur.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      toggleMulti(current.id, opt.value, current.maxSelections ?? 3)
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      checked ? "border-accent bg-accent/10" : "border-border"
                    }`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    {opt.description && (
                      <div className="text-xs text-muted">{opt.description}</div>
                    )}
                  </button>
                );
              })
            : current.options.map((opt) => {
                const cur = answers[current.id];
                const selected = cur === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => chooseSingle(current.id, opt.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      selected ? "border-accent bg-accent/10" : "border-border"
                    }`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    {opt.description && (
                      <div className="text-xs text-muted">{opt.description}</div>
                    )}
                  </button>
                );
              })}
        </div>

        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="text-xs text-muted disabled:opacity-50"
          >
            ← Back
          </button>
          {isLast ? (
            <button
              type="button"
              disabled={!allAnswered}
              onClick={() => onSubmit(answers)}
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Refine
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
              disabled={!(current.id in answers)}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next <ChevronRight className="inline h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
