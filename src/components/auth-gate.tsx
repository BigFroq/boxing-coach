"use client";

import { useState, useEffect } from "react";
import { Loader2, Mail } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { signInWithMagicLink } from "@/lib/auth";
import type { User } from "@supabase/supabase-js";

interface AuthGateProps {
  children: (user: User) => React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  if (user) {
    return <>{children(user)}</>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || sending) return;

    setSending(true);
    setError(null);

    const { error: authError } = await signInWithMagicLink(email.trim());
    setSending(false);

    if (authError) {
      setError(authError);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent font-bold text-white text-lg">
            PD
          </div>
          <h1 className="text-xl font-semibold">Punch Doctor AI</h1>
          <p className="mt-1 text-sm text-muted">Sign in to start training</p>
        </div>

        {sent ? (
          <div className="rounded-lg border border-border bg-surface-hover p-4 text-center">
            <Mail className="mx-auto mb-2 h-6 w-6 text-accent" />
            <p className="text-sm font-medium">Check your email</p>
            <p className="mt-1 text-xs text-muted">
              We sent a magic link to <strong>{email}</strong>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent"
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className="w-full rounded-lg bg-accent py-3 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                "Send magic link"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
