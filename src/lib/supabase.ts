import { createClient } from "@supabase/supabase-js";

// Singleton client — reused across all requests
let cachedClient: ReturnType<typeof createClient> | null = null;

export function createServerClient() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  cachedClient = createClient(url, key);
  return cachedClient;
}
