"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, CheckCircle } from "lucide-react";

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendToCoach = useCallback(
    async (allMessages: Message[]) => {
      setLoading(true);
      setStreaming(false);

      try {
        const response = await fetch("/api/coach/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, messages: allMessages }),
        });

        if (!response.ok || !response.body) {
          throw new Error("Failed to connect to coach");
        }

        setLoading(false);
        setStreaming(true);

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
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Something went wrong. Please try again." },
        ]);
      } finally {
        setLoading(false);
        setStreaming(false);
      }
    },
    [userId]
  );

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
              {msg.content || (loading && <Loader2 className="h-4 w-4 animate-spin text-muted" />)}
            </div>
          </div>
        ))}
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell your coach..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent"
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
