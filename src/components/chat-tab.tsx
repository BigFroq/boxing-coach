"use client";

import { useState, useRef, useEffect, useCallback, type ComponentType } from "react";
import { Send, RefreshCw, History, Sparkles, ChevronDown, Brain } from "lucide-react";
import { FeedbackWidget } from "@/components/feedback-widget";
import { track } from "@/lib/analytics";
import { renderInlineBold } from "@/lib/render-inline-bold";
import { getThinkingSequence } from "@/lib/thinking-sequence";
import { formatRelativeTime } from "@/lib/relative-time";

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  /** Raw extended-thinking summary from Claude (only set when the user had Think Longer on). */
  thinking?: string;
  /** Milliseconds spent thinking — locked in when the answer text starts streaming. */
  thinkingDurationMs?: number;
}

export type SuggestionIcon = ComponentType<{ size?: number; className?: string }>;

export interface Suggestion {
  text: string;
  Icon: SuggestionIcon;
}

interface ChatTabProps {
  systemContext: string;
  placeholder: string;
  suggestions: Suggestion[];
  initialQuery?: string;
  heroIcon: SuggestionIcon;
  heroTitle: string;
  heroSubtitle: string;
  /** Extra payload sent to /api/chat (e.g. style profile). */
  extraContext?: Record<string, unknown>;
  extraContextProvider?: () => Promise<Record<string, unknown>>;
  /** Storage namespace override so embedded chats don't collide with tabbed ones. */
  storageKeyOverride?: string;
  /** Anonymous user id, used as the rate-limit key server-side. */
  userId?: string;
}

interface SavedConversation {
  id: string;
  preview: string;
  messages: Message[];
  timestamp: number;
}

function loadHistory(key: string): SavedConversation[] {
  try {
    const saved = localStorage.getItem(key + "-history");
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveHistory(key: string, history: SavedConversation[]) {
  localStorage.setItem(key + "-history", JSON.stringify(history.slice(0, 20)));
}


export function ChatTab({
  systemContext,
  placeholder,
  suggestions,
  initialQuery,
  heroIcon: HeroIcon,
  heroTitle,
  heroSubtitle,
  extraContext,
  extraContextProvider,
  storageKeyOverride,
  userId,
}: ChatTabProps) {
  const storageKey = storageKeyOverride ?? `boxing-coach-chat-${systemContext}`;
  const isTechnique = systemContext === "technique";
  const thinkLongerKey = `${storageKey}-think-longer`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<SavedConversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [slowWarning, setSlowWarning] = useState(false);
  const [thinkLonger, setThinkLonger] = useState(false);
  const [thinkingSequence, setThinkingSequence] = useState<string[]>([]);
  const [thinkingStep, setThinkingStep] = useState(0);
  // Tracks which assistant messages have their extended-thinking block expanded.
  // Stream keeps it open; once the answer text starts we auto-collapse.
  const [expandedThinking, setExpandedThinking] = useState<Set<number>>(() => new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFailedMessageRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Typewriter buffer — server chunks land in targetRef, an interval drains
  // displayedRef toward it ~1 char per tick so text types letter by letter.
  const targetRef = useRef("");
  const displayedRef = useRef("");
  const streamDoneRef = useRef(false);
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Extended-thinking timing: when the first thinking delta arrives we mark
  // the start; when the first text delta arrives we lock in the duration.
  const thinkingStartRef = useRef<number | null>(null);
  const firstTextSeenRef = useRef(false);

  // Fight card (technique station aside) — real data from the coach progress
  // API: top focus area, session count, last-session recap.
  const [fightCard, setFightCard] = useState<{
    focus: string | null;
    totalSessions: number;
    lastSession: { summary: string | null; createdAt: string } | null;
  } | null>(null);

  useEffect(() => {
    if (!isTechnique || !userId || userId === "anon") return;
    let cancelled = false;
    fetch(`/api/coach/progress?userId=${userId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const active = (data.focusAreas ?? []).find(
          (f: { status: string }) => ["new", "active", "improving"].includes(f.status)
        );
        const last = (data.recentSessions ?? [])[0];
        setFightCard({
          focus: active?.name ?? null,
          totalSessions: data.stats?.totalSessions ?? 0,
          lastSession: last ? { summary: last.summary ?? null, createdAt: last.created_at } : null,
        });
      })
      .catch(() => {}); // decorative aside — silent failure keeps placeholders
    return () => {
      cancelled = true;
    };
  }, [isTechnique, userId]);

  const stopTypewriter = useCallback(() => {
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
  }, []);

  // Load current conversation, history, and toggle state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch { /* ignore */ }
    setHistory(loadHistory(storageKey));
    try {
      setThinkLonger(localStorage.getItem(thinkLongerKey) === "1");
    } catch { /* ignore */ }
  }, [storageKey, thinkLongerKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Persist current conversation to localStorage
  useEffect(() => {
    const MAX_PERSIST_MESSAGES = 30;
    const persistable = messages
      .filter((m) => !m.error)
      .slice(-MAX_PERSIST_MESSAGES);
    if (persistable.length === 0) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(persistable));
    } catch (e) {
      if ((e as { name?: string }).name === "QuotaExceededError") {
        try {
          const histKey = `${storageKey}-history`;
          const hist = JSON.parse(localStorage.getItem(histKey) ?? "[]") as unknown[];
          localStorage.setItem(histKey, JSON.stringify(hist.slice(-5)));
          localStorage.setItem(storageKey, JSON.stringify(persistable));
        } catch {
          console.warn("chat persist permanently failed; storage full");
        }
      }
    }
  }, [messages, storageKey]);

  const toggleThinkingExpanded = useCallback((idx: number) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleThinkLonger = useCallback(() => {
    setThinkLonger((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(thinkLongerKey, next ? "1" : "0");
      } catch { /* ignore */ }
      return next;
    });
  }, [thinkLongerKey]);

  const archiveAndNewChat = useCallback(() => {
    if (messages.length > 0) {
      const firstUserMsg = messages.find(m => m.role === "user");
      const conv: SavedConversation = {
        id: Date.now().toString(),
        preview: firstUserMsg?.content.slice(0, 80) ?? "Conversation",
        messages: messages,
        timestamp: Date.now(),
      };
      const updated = [conv, ...loadHistory(storageKey)].slice(0, 20);
      saveHistory(storageKey, updated);
      setHistory(updated);
    }
    setMessages([]);
    localStorage.removeItem(storageKey);
  }, [messages, storageKey]);

  const loadConversation = useCallback((conv: SavedConversation) => {
    if (messages.length > 0) {
      const firstUserMsg = messages.find(m => m.role === "user");
      const current: SavedConversation = {
        id: Date.now().toString(),
        preview: firstUserMsg?.content.slice(0, 80) ?? "Conversation",
        messages: messages,
        timestamp: Date.now(),
      };
      const updated = [current, ...loadHistory(storageKey).filter(c => c.id !== conv.id)].slice(0, 20);
      saveHistory(storageKey, updated);
      setHistory(updated);
    } else {
      const updated = loadHistory(storageKey).filter(c => c.id !== conv.id);
      saveHistory(storageKey, updated);
      setHistory(updated);
    }
    setMessages(conv.messages);
    localStorage.setItem(storageKey, JSON.stringify(conv.messages));
    setHistoryOpen(false);
  }, [messages, storageKey]);

  const deleteConversation = useCallback((id: string) => {
    const updated = loadHistory(storageKey).filter(c => c.id !== id);
    saveHistory(storageKey, updated);
    setHistory(updated);
  }, [storageKey]);

  useEffect(() => {
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      abortRef.current?.abort();
      stopTypewriter();
    };
  }, [stopTypewriter]);

  // Rotate the thinking-indicator line while we wait for the first stream token.
  // The last line parks once reached — clamping happens at render time.
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setThinkingStep((s) => s + 1);
    }, 1600);
    return () => clearInterval(id);
  }, [loading]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading || streaming) return;

    const userMessage: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setSlowWarning(false);
    setThinkingSequence(getThinkingSequence(text.trim(), systemContext));
    setThinkingStep(0);
    lastFailedMessageRef.current = text.trim();

    slowTimerRef.current = setTimeout(() => {
      setSlowWarning(true);
    }, 10000);

    track("chat_submit", {
      surface: systemContext,
      chars: text.trim().length,
      thinkLonger,
      turn: newMessages.filter((m) => m.role === "user").length,
    });

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let dynamicContext: Record<string, unknown> = {};
    if (extraContextProvider) {
      try {
        dynamicContext = await extraContextProvider();
      } catch (err) {
        // Silent — chat submit must not break because of context fetch failure.
        // Coach falls back to whatever static extraContext was passed.
        console.error("[chat-tab] extraContextProvider failed:", err);
      }
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: newMessages
            .filter((m) => !m.error)
            .map((m) => ({ role: m.role, content: m.content })),
          context: systemContext,
          thinkLonger,
          userId,
          ...(extraContext ?? {}),
          ...dynamicContext,
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("RATE_LIMIT");
        }
        throw new Error("Failed to get response");
      }
      if (!res.body) throw new Error("No response body");

      const assistantIndex = newMessages.length;
      setMessages([...newMessages, { role: "assistant", content: "" }]);
      setLoading(false);
      setStreaming(true);
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
      setSlowWarning(false);

      // Reset typewriter for this message.
      targetRef.current = "";
      displayedRef.current = "";
      streamDoneRef.current = false;
      thinkingStartRef.current = null;
      firstTextSeenRef.current = false;
      stopTypewriter();

      typewriterIntervalRef.current = setInterval(() => {
        const behind = targetRef.current.length - displayedRef.current.length;
        if (behind <= 0) {
          if (streamDoneRef.current) {
            stopTypewriter();
            setStreaming(false);
            inputRef.current?.focus();
          }
          return;
        }
        // Adaptive pacing — 1 char per tick feels like typing; speed up when the
        // buffer gets far ahead so we never lag noticeably behind the stream.
        const step = behind > 300 ? 6 : behind > 100 ? 3 : behind > 25 ? 2 : 1;
        const nextLen = Math.min(displayedRef.current.length + step, targetRef.current.length);
        displayedRef.current = targetRef.current.slice(0, nextLen);
        const snapshot = displayedRef.current;
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[assistantIndex]) {
            updated[assistantIndex] = { ...updated[assistantIndex], content: snapshot };
          }
          return updated;
        });
      }, 18);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "text") {
              // First text delta after any thinking → lock in the duration and
              // auto-collapse the thinking block so the answer takes focus.
              if (!firstTextSeenRef.current) {
                firstTextSeenRef.current = true;
                if (thinkingStartRef.current !== null) {
                  const duration = Date.now() - thinkingStartRef.current;
                  setMessages((prev) => {
                    const updated = [...prev];
                    if (updated[assistantIndex]) {
                      updated[assistantIndex] = {
                        ...updated[assistantIndex],
                        thinkingDurationMs: duration,
                      };
                    }
                    return updated;
                  });
                  setExpandedThinking((prev) => {
                    if (!prev.has(assistantIndex)) return prev;
                    const next = new Set(prev);
                    next.delete(assistantIndex);
                    return next;
                  });
                }
              }
              targetRef.current += event.content;
            } else if (event.type === "thinking") {
              if (thinkingStartRef.current === null) {
                thinkingStartRef.current = Date.now();
                setExpandedThinking((prev) => {
                  const next = new Set(prev);
                  next.add(assistantIndex);
                  return next;
                });
              }
              setMessages((prev) => {
                const updated = [...prev];
                if (updated[assistantIndex]) {
                  updated[assistantIndex] = {
                    ...updated[assistantIndex],
                    thinking: (updated[assistantIndex].thinking ?? "") + event.content,
                  };
                }
                return updated;
              });
            } else if (event.type === "done") {
              streamDoneRef.current = true;
            } else if (event.type === "error") {
              stopTypewriter();
              setMessages((prev) => {
                const updated = [...prev];
                updated[assistantIndex] = {
                  role: "assistant",
                  content: "Sorry, something went wrong during streaming. Please try again.",
                  error: true,
                };
                return updated;
              });
              setStreaming(false);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Belt-and-suspenders: if the server closed without a "done" event,
      // still let the typewriter finish draining the buffer.
      streamDoneRef.current = true;
      lastFailedMessageRef.current = null;

      // If thinking happened but no text followed, still lock in the duration
      // so the block stops saying "Thinking…" forever.
      if (thinkingStartRef.current !== null && !firstTextSeenRef.current) {
        const duration = Date.now() - thinkingStartRef.current;
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[assistantIndex]) {
            updated[assistantIndex] = {
              ...updated[assistantIndex],
              thinkingDurationMs: duration,
            };
          }
          return updated;
        });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setLoading(false);
        setStreaming(false);
        return;
      }
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
      setSlowWarning(false);
      stopTypewriter();

      const isNetworkError = err instanceof TypeError && err.message === "Failed to fetch";
      const isRateLimit = err instanceof Error && err.message === "RATE_LIMIT";
      const errorContent = isRateLimit
        ? "You're sending messages fast — give it about a minute, then try again."
        : isNetworkError
        ? "Connection error — check your internet and try again."
        : "Sorry, something went wrong. Please try again.";

      setMessages([
        ...newMessages,
        { role: "assistant", content: errorContent, error: true },
      ]);
      setLoading(false);
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [messages, loading, streaming, systemContext, thinkLonger, extraContext, extraContextProvider, userId, stopTypewriter]);

  const initialQueryFiredRef = useRef(false);
  useEffect(() => {
    // Guard against the React 19 StrictMode dev mount→unmount→remount cycle
    // which would otherwise double-fire the initial query on routes that pass
    // `initialQuery` as a prop (notably /pd). The ref alone isn't enough since
    // it resets on remount; also bail if the conversation already contains the
    // same message (hydrated from localStorage), or if we already have any
    // user messages.
    if (
      initialQuery &&
      !initialQueryFiredRef.current &&
      !loading &&
      !streaming &&
      !messages.some((m) => m.role === "user" && m.content === initialQuery)
    ) {
      initialQueryFiredRef.current = true;
      sendMessage(initialQuery);
    }
  }, [initialQuery, loading, streaming, sendMessage, messages]);

  function handleRetry() {
    if (lastFailedMessageRef.current) {
      setMessages((prev) => prev.slice(0, -1));
      sendMessage(lastFailedMessageRef.current);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex min-h-full flex-col">
            {/* Past Conversations pill row */}
            {history.length > 0 && (
              <div className="px-4 sm:px-6 pt-4">
                <div className="max-w-3xl mx-auto">
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-surface hover:bg-surface-hover text-sm text-muted hover:text-foreground transition-colors"
                  >
                    <History size={14} />
                    <span>Past Conversations</span>
                    <span className="text-xs opacity-70">({history.length})</span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${historyOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {historyOpen && (
                    <div className="mt-3 space-y-1.5">
                      {history.map((conv) => (
                        <div
                          key={conv.id}
                          className="flex items-center justify-between rounded-lg border border-border bg-surface hover:bg-surface-hover px-4 py-2.5 group transition-colors"
                        >
                          <button
                            onClick={() => loadConversation(conv)}
                            className="flex-1 text-left text-sm truncate mr-3"
                          >
                            <span className="text-foreground">{conv.preview}</span>
                            <span className="text-xs text-muted ml-2">
                              {new Date(conv.timestamp).toLocaleDateString()}
                            </span>
                          </button>
                          <button
                            onClick={() => deleteConversation(conv.id)}
                            aria-label="Delete conversation"
                            className="text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Technique is a training station; other chats retain the compact coach hero. */}
            {isTechnique ? (
              <div className="flex-1 overflow-y-auto text-foreground">
                <div className="mx-auto max-w-6xl px-5 py-4 sm:px-9 sm:py-5 lg:px-14 lg:py-6">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ember">The mechanics room</p>
                  <h2 className="mt-2 max-w-3xl text-3xl font-semibold normal-case leading-[0.95] tracking-[-0.055em] sm:text-4xl sm:uppercase lg:text-5xl">{heroTitle}</h2>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/50 sm:text-base">{heroSubtitle}</p>

                  <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(15rem,.8fr)]">
                    <section className="flex min-h-44 flex-col justify-between border border-ink/10 bg-gradient-to-br from-surface-hover/85 via-surface/85 to-surface-2/85 p-5 text-foreground backdrop-blur-sm sm:p-6">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ember">Ask the coach</p>
                        <h3 className="mt-3 max-w-md text-3xl font-semibold uppercase leading-[.95] tracking-[-0.045em]">What are we improving today?</h3>
                      </div>
                      <div>
                        <div className="flex items-end gap-3 border-b-2 border-ink/15 pb-2">
                          <textarea
                            ref={inputRef}
                            aria-label={placeholder}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Punch, sequence, or problem…"
                            rows={1}
                            className="min-h-11 flex-1 resize-none bg-transparent px-0 py-2 text-base placeholder:text-ink/35 focus:outline-none"
                          />
                          <button
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || loading || streaming}
                            className="shrink-0 bg-accent px-4 py-3 font-mono text-xs font-medium uppercase tracking-wide text-white hover:bg-accent-hover disabled:opacity-40"
                          >
                            Break it down →
                          </button>
                        </div>
                        <button onClick={toggleThinkLonger} aria-pressed={thinkLonger} className={`mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide ${thinkLonger ? "text-ember" : "text-ink/45"}`}>
                          <Sparkles size={12} /> Think longer {thinkLonger && "· on"}
                        </button>
                      </div>
                    </section>

                    <aside className="border border-border-accent/65 bg-surface-2/80 p-5 backdrop-blur-sm sm:p-6">
                      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ember">Fight card</p>
                      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5 text-sm lg:grid-cols-1">
                        <div className="border-b border-ink/12 pb-4">
                          <p className="text-ink/40">Focus</p>
                          <p className="mt-1 font-mono text-xs uppercase">{fightCard?.focus ?? "—"}</p>
                        </div>
                        <div className="border-b border-ink/12 pb-4">
                          <p className="text-ink/40">Sessions logged</p>
                          <p className="mt-1 font-mono text-xs">{fightCard ? fightCard.totalSessions : "—"}</p>
                        </div>
                        <div className="col-span-2 lg:col-span-1">
                          <p className="text-ink/40">Last session</p>
                          {fightCard?.lastSession ? (
                            <>
                              <p className="mt-1 font-mono text-xs text-ember">{formatRelativeTime(fightCard.lastSession.createdAt)}</p>
                              {fightCard.lastSession.summary && (
                                <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-ink/55">{fightCard.lastSession.summary}</p>
                              )}
                            </>
                          ) : (
                            <p className="mt-1 font-mono text-xs text-ink/55">Nothing logged yet — see My Coach</p>
                          )}
                        </div>
                      </div>
                    </aside>
                  </div>

                  <div className="mt-8 flex items-center justify-between gap-4">
                    <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">Start with a fight question</h3>
                    <span className="hidden font-mono text-[10px] uppercase tracking-wide text-ink/30 sm:block">Pick one to begin</span>
                  </div>
                  <div className="mt-4 grid border-l border-t border-ink/12 sm:grid-cols-2 lg:grid-cols-4">
                    {suggestions.map((s, index) => {
                      const Icon = s.Icon;
                      return (
                        <button key={s.text} onClick={() => sendMessage(s.text)} className="group min-h-36 border-b border-r border-ink/12 bg-surface/72 p-5 text-left hover:bg-surface-hover">
                          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ember"><Icon size={15} /> 0{index + 1} / technique</span>
                          <span className="mt-5 block text-sm font-medium leading-snug text-ink/80 group-hover:text-foreground">{s.text}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-start px-4 sm:px-6 py-6 sm:py-8">
                <div className="w-full max-w-4xl flex flex-col items-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20 mb-5"><HeroIcon size={26} className="text-accent" /></div>
                  <h2 className="text-2xl font-semibold mb-2 text-center">{heroTitle}</h2>
                  <p className="text-sm text-muted text-center max-w-md mb-8 leading-relaxed">{heroSubtitle}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                    {suggestions.map((s) => {
                      const Icon = s.Icon;
                      return <button key={s.text} onClick={() => sendMessage(s.text)} className="flex items-start gap-3 text-left px-4 py-3 rounded-xl border border-border bg-surface hover:bg-surface-hover hover:border-accent/40 transition-colors text-sm"><Icon size={16} className="text-accent shrink-0 mt-0.5" /><span className="leading-snug">{s.text}</span></button>;
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 sm:px-6 py-4">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className="max-w-[90%] sm:max-w-[80%]">
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-accent text-white rounded-br-md"
                          : "bg-surface border border-border rounded-bl-md"
                      }`}
                    >
                      {m.role === "assistant" && m.thinking && (
                        <div className="mb-2 rounded-lg border border-border/60 bg-background/50 overflow-hidden">
                          <button
                            onClick={() => toggleThinkingExpanded(i)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted hover:text-foreground transition-colors"
                            aria-expanded={expandedThinking.has(i)}
                          >
                            <Brain size={12} className="shrink-0 text-accent/80" />
                            <span className="flex-1 text-left">
                              {m.thinkingDurationMs
                                ? `Thought for ${Math.max(1, Math.round(m.thinkingDurationMs / 1000))}s`
                                : "Thinking…"}
                            </span>
                            <ChevronDown
                              size={12}
                              className={`transition-transform ${
                                expandedThinking.has(i) ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                          {expandedThinking.has(i) && (
                            <div className="px-3 pb-3 pt-1 text-xs text-muted leading-relaxed whitespace-pre-wrap border-t border-border/60">
                              {m.thinking}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">
                        {m.role === "assistant" ? renderInlineBold(m.content) : m.content}
                      </div>
                    </div>
                    {m.role === "assistant" && m.error && (
                      <button
                        onClick={handleRetry}
                        className="flex items-center gap-1.5 mt-2 text-xs text-accent hover:text-accent-hover transition-colors"
                      >
                        <RefreshCw size={12} />
                        Retry
                      </button>
                    )}
                    {m.role === "assistant" &&
                      !m.error &&
                      m.content &&
                      !streaming &&
                      i === messages.length - 1 && (
                        <FeedbackWidget
                          surface={systemContext === "drills" ? "drills" : "technique"}
                          query={
                            messages
                              .slice(0, i)
                              .reverse()
                              .find((mm) => mm.role === "user")?.content
                          }
                          response={m.content}
                          userId={userId}
                        />
                      )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-surface border border-border rounded-2xl rounded-bl-md px-4 py-3">
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
          </div>
        )}
      </div>

      {(!isTechnique || messages.length > 0) && (
        <div className="border-t border-border px-4 sm:px-6 py-4">
        {messages.length > 0 && !loading && !streaming && (
          <div className="max-w-3xl mx-auto mb-2">
            <button
              onClick={archiveAndNewChat}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              New chat
            </button>
          </div>
        )}
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            ref={inputRef}
            aria-label={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-surface px-4 py-3 text-base sm:text-sm placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading || streaming}
            aria-label="Send message"
            className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="max-w-3xl mx-auto mt-2">
          <button
            onClick={toggleThinkLonger}
            aria-pressed={thinkLonger}
            className={`flex items-center gap-1.5 text-xs py-2 -my-2 transition-colors ${
              thinkLonger
                ? "text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Sparkles size={12} className={thinkLonger ? "text-accent" : ""} />
            <span>Think Longer</span>
            {thinkLonger && <span className="text-[10px] opacity-70">(on)</span>}
          </button>
        </div>
        </div>
      )}
    </div>
  );
}
