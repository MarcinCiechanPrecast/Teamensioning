import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

export type TestClient = SupabaseClient<Database>;

/**
 * Production-safety guard for the integration suite. The suite signs up real users, and without a
 * service-role key they could never be removed again, so it must only ever run against a local Supabase.
 *
 * Returns the URL unchanged when its hostname is exactly `localhost` or `127.0.0.1`; throws otherwise
 * (missing, empty, unparseable, remote, or a lookalike such as `127.0.0.1.evil.example`).
 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export function assertLocalSupabaseUrl(url: string | undefined): string {
  const refuse = () =>
    new Error(
      `Integration tests only run against a local Supabase (localhost or 127.0.0.1); SUPABASE_URL is ${JSON.stringify(url)}.`,
    );
  if (!url) throw refuse();

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch (cause) {
    throw Object.assign(refuse(), { cause });
  }
  // Exact hostname match: string prefixes would accept 127.0.0.1.evil.example or localhost@evil.example.
  if (!LOCAL_HOSTNAMES.has(hostname)) throw refuse();
  return url;
}

function supabaseKey(): string {
  const key = process.env.SUPABASE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_KEY is not set. Start local Supabase (`npx supabase start`) and copy .env.example to .env " +
        "with its API URL and anon key.",
    );
  }
  return key;
}

/**
 * A fresh, isolated client using the public anon key. Each simulated actor (anon, owner, other user)
 * gets its own instance; nothing is persisted or auto-refreshed, so sessions never leak between actors.
 */
export function anonClient(): TestClient {
  return createClient<Database>(assertLocalSupabaseUrl(process.env.SUPABASE_URL), supabaseKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
