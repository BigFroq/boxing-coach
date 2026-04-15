"use client";

import { useState } from "react";
import { ChevronRight, ChevronLeft, Loader2, RotateCcw } from "lucide-react";

interface Question {
  id: string;
  question: string;
  options: { value: string; label: string; description?: string }[];
}

const questions: Question[] = [
  {
    id: "height",
    question: "What's your height?",
    options: [
      { value: "short", label: "Under 5'7\" / 170cm", description: "Compact frame" },
      { value: "average", label: "5'7\" - 6'0\" / 170-183cm", description: "Average build" },
      { value: "tall", label: "Over 6'0\" / 183cm", description: "Long frame" },
    ],
  },
  {
    id: "build",
    question: "What's your body type?",
    options: [
      { value: "stocky", label: "Stocky / Muscular", description: "Wide shoulders, thick build" },
      { value: "lean", label: "Lean / Athletic", description: "Balanced proportions" },
      { value: "lanky", label: "Long / Lanky", description: "Long limbs, narrow frame" },
    ],
  },
  {
    id: "reach",
    question: "How would you describe your reach relative to your height?",
    options: [
      { value: "short", label: "Short reach", description: "Arms shorter than average for height" },
      { value: "average", label: "Average reach", description: "Proportional to height" },
      { value: "long", label: "Long reach", description: "Arms longer than average — reach advantage" },
    ],
  },
  {
    id: "speed_vs_power",
    question: "What comes more naturally to you?",
    options: [
      { value: "power", label: "Raw power", description: "When I land clean, people feel it" },
      { value: "balanced", label: "A bit of both", description: "Decent speed and decent power" },
      { value: "speed", label: "Fast hands", description: "I can throw quick combos, but I'm not a huge puncher" },
    ],
  },
  {
    id: "temperament",
    question: "How do you naturally fight?",
    options: [
      { value: "aggressive", label: "Pressure fighter", description: "I like coming forward and overwhelming opponents" },
      { value: "counter", label: "Counter puncher", description: "I prefer to react and make opponents miss" },
      { value: "boxer", label: "Outboxer", description: "I like controlling distance and picking shots" },
      { value: "switch", label: "Switch hitter", description: "I like mixing it up — inside, outside, whatever works" },
    ],
  },
  {
    id: "experience",
    question: "What's your experience level?",
    options: [
      { value: "beginner", label: "Beginner", description: "Less than 1 year of training" },
      { value: "intermediate", label: "Intermediate", description: "1-3 years, maybe some sparring" },
      { value: "advanced", label: "Advanced", description: "3+ years, regular sparring or competition" },
    ],
  },
  {
    id: "weakness",
    question: "What's your biggest weakness right now?",
    options: [
      { value: "power", label: "Lack of power", description: "I land but don't hurt people" },
      { value: "defense", label: "Getting hit too much", description: "My defense needs work" },
      { value: "cardio", label: "Gas tank", description: "I slow down after a round or two" },
      { value: "inside", label: "Inside fighting", description: "I struggle when opponents get close" },
      { value: "distance", label: "Distance management", description: "I'm either too far or too close" },
    ],
  },
  {
    id: "goal",
    question: "What's your primary goal?",
    options: [
      { value: "competition", label: "Compete", description: "I want to fight amateur or pro" },
      { value: "sparring", label: "Be better at sparring", description: "Hold my own in the gym" },
      { value: "fitness", label: "Fitness + skill", description: "Get in shape with real technique" },
      { value: "self_defense", label: "Self defense", description: "Be dangerous if I need to be" },
    ],
  },
];

interface StyleResult {
  style_name: string;
  description: string;
  reference_fighters: { name: string; why: string }[];
  key_techniques: string[];
  training_focus: string[];
  punches_to_master: string[];
  stance_recommendation: string;
  alex_wiant_tip: string;
}

export function StyleFinderTab() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StyleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const progress = ((currentQuestion) / questions.length) * 100;
  const isComplete = currentQuestion >= questions.length;

  function selectAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    // Auto-advance after selection
    setTimeout(() => {
      if (currentQuestion < questions.length - 1) {
        setCurrentQuestion((c) => c + 1);
      } else {
        setCurrentQuestion(questions.length);
      }
    }, 300);
  }

  async function getStyleRecommendation() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/style-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });

      if (!res.ok) throw new Error("Failed to get recommendation");

      const data = await res.json();
      setResult(data);
    } catch {
      setError("Failed to generate style recommendation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setCurrentQuestion(0);
    setAnswers({});
    setResult(null);
    setError(null);
  }

  // Show results
  if (result) {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-6 py-8 space-y-6">
          {/* Style Header */}
          <div className="text-center">
            <p className="text-xs uppercase tracking-wider text-accent mb-2">Your recommended style</p>
            <h2 className="text-3xl font-bold mb-3">{result.style_name}</h2>
            <p className="text-muted text-sm leading-relaxed max-w-lg mx-auto">{result.description}</p>
          </div>

          {/* Reference Fighters */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-accent mb-3">Fighters to Study</h3>
            <div className="space-y-3">
              {result.reference_fighters.map((f, i) => (
                <div key={i}>
                  <span className="font-medium">{f.name}</span>
                  <p className="text-sm text-muted mt-0.5">{f.why}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Key Techniques */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-accent mb-3">Key Techniques for Your Style</h3>
            <ul className="space-y-1.5">
              {result.key_techniques.map((t, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-accent shrink-0">-</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Punches to Master */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-accent mb-3">Punches to Master First</h3>
            <div className="flex flex-wrap gap-2">
              {result.punches_to_master.map((p, i) => (
                <span key={i} className="px-3 py-1.5 bg-accent/10 border border-accent/20 rounded-lg text-sm text-accent">
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* Stance */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-accent mb-2">Stance Recommendation</h3>
            <p className="text-sm leading-relaxed">{result.stance_recommendation}</p>
          </div>

          {/* Training Focus */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-accent mb-3">Training Focus</h3>
            <ul className="space-y-1.5">
              {result.training_focus.map((t, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-green-500 shrink-0">{i + 1}.</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Alex's Tip */}
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-accent mb-2">Punch Doctor Tip</h3>
            <p className="text-sm leading-relaxed italic">{result.alex_wiant_tip}</p>
          </div>

          {/* Restart */}
          <button
            onClick={reset}
            className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mx-auto"
          >
            <RotateCcw size={14} />
            Start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="max-w-xl mx-auto w-full px-6 py-8 flex-1 flex flex-col">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-muted mb-2">
            <span>Question {Math.min(currentQuestion + 1, questions.length)} of {questions.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {!isComplete ? (
          <>
            {/* Question */}
            <div className="flex-1 flex flex-col justify-center">
              <h2 className="text-xl font-semibold mb-6">{questions[currentQuestion].question}</h2>
              <div className="space-y-3">
                {questions[currentQuestion].options.map((opt) => {
                  const isSelected = answers[questions[currentQuestion].id] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => selectAnswer(questions[currentQuestion].id, opt.value)}
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
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-6">
              <button
                onClick={() => setCurrentQuestion((c) => Math.max(0, c - 1))}
                disabled={currentQuestion === 0}
                className="flex items-center gap-1 text-sm text-muted hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
                Back
              </button>
              {answers[questions[currentQuestion]?.id] && (
                <button
                  onClick={() => {
                    if (currentQuestion < questions.length - 1) {
                      setCurrentQuestion((c) => c + 1);
                    } else {
                      setCurrentQuestion(questions.length);
                    }
                  }}
                  className="flex items-center gap-1 text-sm text-accent hover:text-accent-hover transition-colors"
                >
                  {currentQuestion === questions.length - 1 ? "See results" : "Next"}
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </>
        ) : (
          /* Ready to analyze */
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <h2 className="text-xl font-semibold mb-2">Ready to find your style</h2>
            <p className="text-sm text-muted mb-6 max-w-sm">
              Based on your answers, we&apos;ll match you with a fighting style and recommend
              fighters to study from The Punch Doctor&apos;s analysis library.
            </p>
            <button
              onClick={getStyleRecommendation}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-xl font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Analyzing your profile...
                </>
              ) : (
                "Find My Style"
              )}
            </button>
            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
            <button
              onClick={() => setCurrentQuestion(0)}
              className="flex items-center gap-1 text-sm text-muted hover:text-foreground mt-4 transition-colors"
            >
              <ChevronLeft size={14} />
              Change answers
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
