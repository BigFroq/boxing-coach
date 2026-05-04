"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { allQuestions, getQuestionSequence, getQuestionText } from "@/data/questions";
import type { Question, ExperienceLevel } from "@/data/questions";
import { createBrowserClient } from "@/lib/supabase-browser";

interface QuestionnaireProps {
  userId: string;
  onComplete: (answers: Record<string, string | string[] | number>) => void;
}

export function Questionnaire({ userId, onComplete }: QuestionnaireProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const experience = (answers.experience as ExperienceLevel) ?? "beginner";
  const questions = getQuestionSequence(experience);
  const totalQuestions = questions.length;
  const isComplete = currentIndex >= totalQuestions;
  const currentQuestion = questions[currentIndex] as Question | undefined;

  const STORAGE_KEY = "boxing-coach-quiz-progress";

  // Load saved progress on mount — try Supabase first, fall back to localStorage
  useEffect(() => {
    async function load() {
      try {
        const supabase = createBrowserClient();
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user) {
          const { data } = await supabase
            .from("quiz_progress")
            .select("answers, current_question")
            .eq("user_id", authData.user.id)
            .single() as { data: { answers: Record<string, string | string[] | number>; current_question: number } | null };
          if (data) {
            setAnswers(data.answers);
            setCurrentIndex(data.current_question);
            setLoaded(true);
            return;
          }
        }
      } catch {
        // Supabase not available, fall through to localStorage
      }

      // Fallback: localStorage
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.answers) setAnswers(parsed.answers);
          if (typeof parsed.currentIndex === "number") setCurrentIndex(parsed.currentIndex);
        }
      } catch {
        // ignore
      }
      setLoaded(true);
    }
    load();
  }, [userId]);

  // Save progress — localStorage always, Supabase if authed
  const saveProgress = useCallback(
    (newAnswers: Record<string, string | string[] | number>, newIndex: number) => {
      // Always save to localStorage immediately
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers: newAnswers, currentIndex: newIndex }));
      } catch {
        // ignore
      }

      // Debounced save to Supabase if authed
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const supabase = createBrowserClient();
          const { data: authData } = await supabase.auth.getUser();
          if (authData.user) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from("quiz_progress") as any)
              .upsert({
                user_id: authData.user.id,
                answers: newAnswers,
                current_question: newIndex,
                experience_level: (newAnswers.experience as string) ?? null,
                updated_at: new Date().toISOString(),
              }, { onConflict: "user_id" });
          }
        } catch {
          // Supabase save failed, localStorage already saved above
        }
      }, 500);
    },
    [userId]
  );

  function selectAnswer(questionId: string, value: string | string[] | number) {
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);

    // Auto-advance after 300ms (skip for multiselect — user clicks "Next")
    const q = questions.find((q) => q.id === questionId);
    if (q?.format !== "multiselect") {
      setTimeout(() => {
        const nextIndex = Math.min(currentIndex + 1, totalQuestions);
        setCurrentIndex(nextIndex);
        saveProgress(newAnswers, nextIndex);
      }, 300);
    } else {
      saveProgress(newAnswers, currentIndex);
    }
  }

  function toggleMultiselect(questionId: string, value: string, max: number) {
    const current = (answers[questionId] as string[]) ?? [];
    let updated: string[];
    if (current.includes(value)) {
      updated = current.filter((v) => v !== value);
    } else if (current.length < max) {
      updated = [...current, value];
    } else {
      return; // at max
    }
    const newAnswers = { ...answers, [questionId]: updated };
    setAnswers(newAnswers);
    saveProgress(newAnswers, currentIndex);
  }

  function setSliderValue(questionId: string, value: number) {
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);
    saveProgress(newAnswers, currentIndex);
  }

  function goBack() {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      saveProgress(answers, newIndex);
    }
  }

  function goNext() {
    if (currentIndex < totalQuestions) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      saveProgress(answers, newIndex);
    }
  }

  function handleComplete() {
    onComplete(answers);
  }

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  // Complete state — ready to generate profile
  if (isComplete) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <h2 className="text-xl font-semibold mb-2">Ready to build your fighter profile</h2>
        <p className="text-sm text-muted mb-6 max-w-sm">
          Based on your {totalQuestions} answers, we&apos;ll score you across 8 fighting dimensions
          and match you with fighters from The Punch Doctor&apos;s analysis library.
        </p>
        <button
          onClick={handleComplete}
          className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-xl font-medium hover:bg-accent/90 transition-colors"
        >
          Build My Profile
        </button>
        <button
          onClick={() => { setCurrentIndex(currentIndex - 1); }}
          className="flex items-center gap-1 text-sm text-muted hover:text-foreground mt-4 transition-colors"
        >
          <ChevronLeft size={14} />
          Change answers
        </button>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const progress = (currentIndex / totalQuestions) * 100;
  const questionText = getQuestionText(currentQuestion, experience);
  const hasAnswer = answers[currentQuestion.id] !== undefined;

  // Check if we're at a new part
  const prevQuestion = currentIndex > 0 ? questions[currentIndex - 1] : null;
  const showPartHeader = !prevQuestion || prevQuestion.part !== currentQuestion.part;

  return (
    <div className="max-w-xl mx-auto w-full px-6 py-8 flex-1 flex flex-col">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-muted mb-2">
          <span>
            Part {currentQuestion.part}: {currentQuestion.partTitle} &middot; Question{" "}
            {currentIndex + 1} of {totalQuestions}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Part header */}
      {showPartHeader && (
        <div className="mb-4 pb-3 border-b border-border">
          <span className="text-xs uppercase tracking-wider text-accent font-medium">
            Part {currentQuestion.part}
          </span>
          <h3 className="text-sm font-semibold mt-0.5">{currentQuestion.partTitle}</h3>
        </div>
      )}

      {/* Question */}
      <div className="flex-1 flex flex-col justify-center">
        {/* Scenario indicator */}
        {currentQuestion.isScenario && (
          <span className="text-xs text-accent uppercase tracking-wider mb-2">Scenario</span>
        )}

        <h2 className="text-xl font-semibold mb-2">{questionText}</h2>

        {/* Honest prompt */}
        {currentQuestion.honestPrompt && (
          <p className="text-xs text-muted italic mb-4">{currentQuestion.honestPrompt}</p>
        )}

        {/* MC Options */}
        {currentQuestion.format === "mc" && (
          <div className="space-y-3 mt-4">
            {currentQuestion.options.map((opt) => {
              const isSelected = answers[currentQuestion.id] === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => selectAnswer(currentQuestion.id, opt.value)}
                  aria-pressed={isSelected}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    isSelected
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border bg-surface hover:bg-surface-hover"
                  }`}
                >
                  <div className="font-medium text-sm">{opt.label}</div>
                  {opt.description && (
                    <div className="text-xs text-muted mt-0.5">{opt.description}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Slider */}
        {currentQuestion.format === "slider" && (
          <div className="mt-6 space-y-4">
            <input
              type="range"
              min={0}
              max={100}
              value={(answers[currentQuestion.id] as number) ?? 50}
              onChange={(e) => setSliderValue(currentQuestion.id, Number(e.target.value))}
              aria-label={questionText}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={(answers[currentQuestion.id] as number) ?? 50}
              aria-valuetext={
                currentQuestion.sliderLabels
                  ? `${(answers[currentQuestion.id] as number) ?? 50} (${currentQuestion.sliderLabels.min} → ${currentQuestion.sliderLabels.max})`
                  : `${(answers[currentQuestion.id] as number) ?? 50}`
              }
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xs text-muted">
              <span>{currentQuestion.sliderLabels?.min}</span>
              <span>{currentQuestion.sliderLabels?.max}</span>
            </div>
            {!hasAnswer && (
              <button
                onClick={() => selectAnswer(currentQuestion.id, 50)}
                className="mx-auto block text-sm text-accent hover:text-accent/80 transition-colors"
              >
                Confirm selection
              </button>
            )}
          </div>
        )}

        {/* Multiselect */}
        {currentQuestion.format === "multiselect" && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              {currentQuestion.options.map((opt) => {
                const selected = ((answers[currentQuestion.id] as string[]) ?? []).includes(opt.value);
                const atMax =
                  ((answers[currentQuestion.id] as string[]) ?? []).length >=
                  (currentQuestion.maxSelections ?? 2);
                return (
                  <button
                    key={opt.value}
                    onClick={() =>
                      toggleMultiselect(
                        currentQuestion.id,
                        opt.value,
                        currentQuestion.maxSelections ?? 2
                      )
                    }
                    disabled={!selected && atMax}
                    aria-pressed={selected}
                    className={`px-4 py-2.5 rounded-xl border text-sm transition-all ${
                      selected
                        ? "border-accent bg-accent/10 text-foreground"
                        : atMax
                          ? "border-border bg-surface opacity-40 cursor-not-allowed"
                          : "border-border bg-surface hover:bg-surface-hover"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted mt-3">
              {((answers[currentQuestion.id] as string[]) ?? []).length} /{" "}
              {currentQuestion.maxSelections ?? 2} selected
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-6">
        <button
          onClick={goBack}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-3 py-2 -mx-3 -my-2 text-sm text-muted hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={16} />
          Back
        </button>
        {hasAnswer && (
          <button
            onClick={goNext}
            className="flex items-center gap-1 px-3 py-2 -mx-3 -my-2 text-sm text-accent hover:text-accent/80 transition-colors"
          >
            {currentIndex === totalQuestions - 1 ? "See results" : "Next"}
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
