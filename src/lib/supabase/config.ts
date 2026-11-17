/**
 * Central place for reading Supabase settings from the environment.
 *
 * Supabase now issues "publishable" / "secret" keys alongside the older "anon" /
 * "service_role" keys, and Vercel's own Supabase integration uses the new names.
 * Both naming styles are accepted so a deployment works whichever the owner pasted.
 *
 * NOTE: keep the literal `process.env.NEXT_PUBLIC_*` references: Next.js inlines them at build time.
 */
export function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function getSupabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

export function getSupabaseServiceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
}

/** Thrown when the server is connected to Supabase but a required key is missing. */
export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

export const CONFIG_HELP =
  'The server is not connected to the database correctly. In Vercel, check the Supabase environment variables (URL, anon/publishable key and service role/secret key) and redeploy.';
