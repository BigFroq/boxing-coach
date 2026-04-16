import { createBrowserClient } from "./supabase-browser";
import type { User, Session } from "@supabase/supabase-js";

export async function getSession(): Promise<Session | null> {
  const supabase = createBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  const supabase = createBrowserClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function signInWithMagicLink(email: string): Promise<{ error: string | null }> {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  const supabase = createBrowserClient();
  await supabase.auth.signOut();
}
