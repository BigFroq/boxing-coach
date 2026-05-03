"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, CheckCircle, AlertTriangle, X, ChevronDown } from "lucide-react";
import { renderInlineBold } from "@/lib/render-inline-bold";
import { getThinkingSequence } from "@/lib/thinking-sequence";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface CoachSessionProps {
  userId: string;
}

export function CoachSession({ userId }: CoachSessionProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [neglected, setNeglected] = useState<string[]>([]);
  const [bannerCollapsed, setBannerCollapsed] = useState<boolean>(false);
  const [thinkingSequence, setThinkingSequence] = useState<string[]>([]);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [slowWarning, setSlowWarning] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const storedCollapsed = window.localStorage.getItem("coach-avoiding-banner-collapsed");
        setBannerCollapsed(storedCollapsed === "true");
      } catch {
        // ignore
      }
    }
    fetch(`/api/coach/progress?userId=${encodeURIComponent(userId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { neglectedFocusAreas?: string[] } | null) => {
        if (data && Array.isArray(data.neglectedFocusAreas)) {
          setNeglected(data.neglectedFocusAreas);
        }
      })
      .catch(() => {
        // Banner just doesn't render; don't block chat.
      });
  }, [userId]);

  const sendToCoach = useCallback(
    async (allMessages: Message[]) => {
      setLoading(true);
      setStreaming(false);
      const lastUser = [...allMessages].reverse().find((m) => m.role === "user")?.content ?? "";
      setThinkingSequence(getThinkingSequence(lastUser, "coach"));
      setThinkingStep(0);
      setSlowWarning(false);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      slowTimerRef.current = setTimeout(() => setSlowWarning(true), 10000);

      try {
        let styleProfile: unknown = null;
        if (typeof window !== "undefined") {
          try {
            const raw = window.localStorage.getItem("boxing-coach-style-profile");
            if (raw) {
              const parsed = JSON.parse(raw) as { result?: unknown };
              styleProfile = parsed?.result ?? null;
            }
          } catch {
            // malformed localStorage — server will treat missing as null
          }
        }

        const response = await fetch("/api/coach/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            messages: allMessages,
            ...(styleProfile ? { styleProfile } : {}),
          }),
        });

        if (!response.ok || !response.body) {
          if (response.status === 429) {
            throw new Error("RATE_LIMIT");
          }
          throw new Error("Failed to connect to coach");
        }

        setLoading(false);
        setStreaming(true);
        if (slowTimerRef.current) {
          clearTimeout(slowTimerRef.current);
          slowTimerRef.current = null;
        }
        setSlowWarning(false);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantContent = "";

        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "text") {
                assistantContent += data.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                  return updated;
                });
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (err) {
        console.error("Coach error:", err);
        const isRateLimit = err instanceof Error && err.message === "RATE_LIMIT";
        const msg = isRateLimit
          ? "You're sending messages fast — give it about a minute, then try again."
          : "Something went wrong. Please try again.";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: msg },
        ]);
      } finally {
        setLoading(false);
        setStreaming(false);
        if (slowTimerRef.current) {
          clearTimeout(slowTimerRef.current);
          slowTimerRef.current = null;
        }
      }
    },
    [userId]
  );

  // Rotate the thinking-indicator line while waiting for the first token.
  // Last line parks once reached; clamping happens at render time.
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setThinkingStep((s) => s + 1), 1600);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      const initMsg: Message = { role: "user", content: "I'm here to log my training session." };
      setMessages([initMsg]);
      sendToCoach([initMsg]);
    }
  }, [initialized, sendToCoach]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading || streaming) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    sendToCoach(updated);
  }, [input, loading, streaming, messages, sendToCoach]);

  const handleFinish = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    try {
      const response = await fetch("/api/coach/save-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, messages }),
      });

      if (response.ok) {
        setSaved(true);
      }
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  }, [userId, messages, saving]);

  const collapseBanner = useCallback(() => {
    setBannerCollapsed(true);
    try {
      window.localStorage.setItem("coach-avoiding-banner-collapsed", "true");
    } catch {
      // ignore
    }
  }, []);

  const expandBanner = useCallback(() => {
    setBannerCollapsed(false);
    try {
      window.localStorage.setItem("coach-avoiding-banner-collapsed", "false");
    } catch {
      // ignore
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const exchangeCount = messages.filter((m) => m.role === "user").length;
  const canFinish = exchangeCount >= 3 && !loading && !streaming && !saved;

  if (saved) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
        <CheckCircle className="h-12 w-12 text-green-400" />
        <div className="text-center">
          <p className="text-lg font-medium">Session logged</p>
          <p className="mt-1 text-sm text-muted">Check My Progress to see your history.</p>
        </div>
        <button
          onClick={() => {
            setMessages([]);
            setSaved(false);
            setInitialized(false);
          }}
          className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          Log another session
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {neglected.length > 0 && !bannerCollapsed && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-300">Coach flagged: you&apos;ve been avoiding</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {neglected.map((name, i) => (
                    <span
                      key={`${i}-${name}`}
                      className="inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={collapseBanner}
                aria-label="Dismiss"
                className="flex-shrink-0 rounded-md p-1 text-red-400 hover:bg-red-500/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {neglected.length > 0 && bannerCollapsed && (
          <button
            onClick={expandBanner}
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Show avoidance list ({neglected.length})
          </button>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-accent/15 text-accent-foreground"
                  : "bg-surface-hover text-foreground"
              }`}
            >
              {msg.content
                ? msg.role === "assistant"
                  ? renderInlineBold(msg.content)
                  : msg.content
                : loading && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl bg-surface-hover px-4 py-3">
              <div
                className="flex items-center gap-2.5"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-end gap-1 pb-0.5" aria-hidden="true">
                  <span
                    className="block size-1.5 rounded-full bg-accent/70 animate-thinking-dot"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="block size-1.5 rounded-full bg-accent/70 animate-thinking-dot"
                    style={{ animationDelay: "180ms" }}
                  />
                  <span
                    className="block size-1.5 rounded-full bg-accent/70 animate-thinking-dot"
                    style={{ animationDelay: "360ms" }}
                  />
                </div>
                {(() => {
                  const seq = thinkingSequence.length > 0 ? thinkingSequence : ["Thinking…"];
                  const idx = Math.min(thinkingStep, seq.length - 1);
                  return (
                    <span
                      key={idx}
                      className="text-xs text-muted animate-thinking-text"
                    >
                      {seq[idx]}
                      {slowWarning && (
                        <span className="text-muted/60"> · still working on it</span>
                      )}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border px-4 sm:px-6 py-3">
        {canFinish && (
          <button
            onClick={handleFinish}
            disabled={saving}
            className="mb-2 w-full rounded-lg border border-green-500/30 bg-green-500/10 py-2 text-sm font-medium text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Finish & save session"}
          </button>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            aria-label="Message to your coach"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell your coach..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-surface-hover px-4 py-3 text-base sm:text-sm text-foreground placeholder:text-muted outline-none focus:border-accent"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || streaming}
            aria-label="Send message"
            className="flex h-[44px] w-[44px] items-center justify-center rounded-lg bg-accent text-white disabled:opacity-50"
          >
            {loading || streaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
