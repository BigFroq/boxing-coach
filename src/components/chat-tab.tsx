"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, ExternalLink, BookOpen } from "lucide-react";

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
}

interface ChatTabProps {
  systemContext: string;
  placeholder: string;
  suggestions: string[];
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
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover border border-border text-xs hover:border-accent transition-colors max-w-[250px]"
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

export function ChatTab({ systemContext, placeholder, suggestions }: ChatTabProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMessage: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

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

      const data = await res.json();
      setMessages([
        ...newMessages,
        { role: "assistant", content: data.content, citations: data.citations ?? [] },
      ]);
    } catch {
      setMessages([
        ...newMessages,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
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
      <div className="flex-1 overflow-y-auto px-6 py-4">
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
                <div className="max-w-[80%]">
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
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-surface border border-border rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 size={16} className="animate-spin text-muted" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border px-6 py-4">
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
            disabled={!input.trim() || loading}
            className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
