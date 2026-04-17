"use client";

import { useState, useRef, useEffect, useCallback, type ComponentType } from "react";
import { Send, Loader2, ExternalLink, BookOpen, RefreshCw, History, Sparkles, ChevronDown } from "lucide-react";

interface SourceCitation {
  type: "video" | "course";
  title: string;
  url?: string;
  file?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: SourceCitation[];
  error?: boolean;
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
  /** Storage namespace override so embedded chats don't collide with tabbed ones. */
  storageKeyOverride?: string;
}

function CitationCards({ citations }: { citations: SourceCitation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="flex gap-2 mt-3 flex-wrap">
      {citations.map((c, i) => (
        <a
          key={i}
          href={c.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover border border-border text-xs hover:border-accent transition-colors max-w-[180px] sm:max-w-[250px]"
        >
          {c.type === "video" ? (
            <ExternalLink size={12} className="text-accent shrink-0" />
          ) : (
            <BookOpen size={12} className="text-accent shrink-0" />
          )}
          <span className="truncate">{c.title}</span>
        </a>
      ))}
    </div>
  );
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
  storageKeyOverride,
}: ChatTabProps) {
  const storageKey = storageKeyOverride ?? `boxing-coach-chat-${systemContext}`;
  const thinkLongerKey = `${storageKey}-think-longer`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<SavedConversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [slowWarning, setSlowWarning] = useState(false);
  const [thinkLonger, setThinkLonger] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFailedMessageRef = useRef<string | null>(null);

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
    if (messages.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, storageKey]);

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
    };
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading || streaming) return;

    const userMessage: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setSlowWarning(false);
    lastFailedMessageRef.current = text.trim();

    slowTimerRef.current = setTimeout(() => {
      setSlowWarning(true);
    }, 10000);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          context: systemContext,
          thinkLonger,
          ...(extraContext ?? {}),
        }),
      });

      if (!res.ok) throw new Error("Failed to get response");
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

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
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
              accumulated += event.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[assistantIndex] = {
                  ...updated[assistantIndex],
                  content: accumulated,
                };
                return updated;
              });
            } else if (event.type === "done") {
              setMessages((prev) => {
                const updated = [...prev];
                updated[assistantIndex] = {
                  ...updated[assistantIndex],
                  content: accumulated,
                  citations: event.citations ?? [],
                };
                return updated;
              });
            } else if (event.type === "error") {
              setMessages((prev) => {
                const updated = [...prev];
                updated[assistantIndex] = {
                  role: "assistant",
                  content: "Sorry, something went wrong during streaming. Please try again.",
                  error: true,
                };
                return updated;
              });
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      lastFailedMessageRef.current = null;
    } catch (err) {
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
      setSlowWarning(false);

      const isNetworkError = err instanceof TypeError && err.message === "Failed to fetch";
      const errorContent = isNetworkError
        ? "Connection error — check your internet and try again."
        : "Sorry, something went wrong. Please try again.";

      setMessages([
        ...newMessages,
        { role: "assistant", content: errorContent, error: true },
      ]);
    } finally {
      setLoading(false);
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [messages, loading, streaming, systemContext, thinkLonger, extraContext]);

  const initialQueryFiredRef = useRef(false);
  useEffect(() => {
    if (initialQuery && !initialQueryFiredRef.current && !loading && !streaming) {
      initialQueryFiredRef.current = true;
      sendMessage(initialQuery);
    }
  }, [initialQuery, loading, streaming, sendMessage]);

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

            {/* Hero + suggestion grid */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10">
              <div className="w-full max-w-3xl flex flex-col items-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20 mb-5">
                  <HeroIcon size={26} className="text-accent" />
                </div>
                <h2 className="text-2xl font-semibold mb-2 text-center">{heroTitle}</h2>
                <p className="text-sm text-muted text-center max-w-md mb-8 leading-relaxed">
                  {heroSubtitle}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  {suggestions.map((s) => {
                    const Icon = s.Icon;
                    return (
                      <button
                        key={s.text}
                        onClick={() => sendMessage(s.text)}
                        className="flex items-start gap-3 text-left px-4 py-3 rounded-xl border border-border bg-surface hover:bg-surface-hover hover:border-accent/40 transition-colors text-sm"
                      >
                        <Icon size={16} className="text-accent shrink-0 mt-0.5" />
                        <span className="leading-snug">{s.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
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
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                    {m.role === "assistant" && m.citations && (
                      <CitationCards citations={m.citations} />
                    )}
                    {m.role === "assistant" && m.error && (
                      <button
                        onClick={handleRetry}
                        className="flex items-center gap-1.5 mt-2 text-xs text-accent hover:text-accent-hover transition-colors"
                      >
                        <RefreshCw size={12} />
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-surface border border-border rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-muted" />
                      {slowWarning && (
                        <span className="text-xs text-muted">Taking longer than expected...</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
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
            className={`flex items-center gap-1.5 text-xs transition-colors ${
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
    </div>
  );
}
