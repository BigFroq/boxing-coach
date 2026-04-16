"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, ExternalLink, BookOpen, RefreshCw } from "lucide-react";

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

interface ChatTabProps {
  systemContext: string;
  placeholder: string;
  suggestions: string[];
  initialQuery?: string;
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

export function ChatTab({ systemContext, placeholder, suggestions, initialQuery }: ChatTabProps) {
  const storageKey = `boxing-coach-chat-${systemContext}`;
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [slowWarning, setSlowWarning] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFailedMessageRef = useRef<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Persist messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, storageKey]);

  // Clean up slow timer on unmount
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

    // Show slow warning after 10s
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
        }),
      });

      if (!res.ok) throw new Error("Failed to get response");
      if (!res.body) throw new Error("No response body");

      // Add empty assistant message for streaming
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

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

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
  }, [messages, loading, streaming, systemContext]);

  // Handle initial query from style finder CTA
  const initialQueryFiredRef = useRef(false);
  useEffect(() => {
    if (initialQuery && !initialQueryFiredRef.current && !loading && !streaming) {
      initialQueryFiredRef.current = true;
      sendMessage(initialQuery);
    }
  }, [initialQuery, loading, streaming, sendMessage]);

  function handleRetry() {
    if (lastFailedMessageRef.current) {
      // Remove the error message first
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
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <p className="text-muted text-sm mb-6">Pick a question or type your own</p>
            <div className="grid gap-2 max-w-lg w-full">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left px-4 py-3 rounded-lg border border-border bg-surface hover:bg-surface-hover transition-colors text-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
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
        )}
      </div>

      <div className="border-t border-border px-4 sm:px-6 py-4">
        {messages.length > 0 && !loading && !streaming && (
          <div className="max-w-3xl mx-auto mb-2">
            <button
              onClick={() => { setMessages([]); localStorage.removeItem(storageKey); }}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              Clear chat
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
      </div>
    </div>
  );
}
