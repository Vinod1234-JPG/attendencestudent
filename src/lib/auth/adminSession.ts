/**
 * Admin session primitives shared by middleware (Edge runtime) and route handlers (Node).
 * Must not import `next/headers` or Node-only modules.
 *
 * Live mode: admins are Supabase Auth users with a `profiles.role` of admin/super_admin.
 * Placeholder (local dev, no Supabase configured): a single admin from ADMIN_EMAIL /
 * ADMIN_PASSWORD, kept in an HMAC-signed cookie keyed by ADMIN_SESSION_SECRET.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const DEV_SESSION_COOKIE = 'mrf_admin_session';
export const DEV_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

export const ADMIN_ROLES = ['admin', 'super_admin'] as const;

export interface AdminIdentity {
  id: string | null;
  email: string;
  role: string;
  mode: 'supabase' | 'development';
}

export function isPlaceholderMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !url || url.includes('placeholder') || url.includes('your-project-id');
}

/** Resolves the signed-in Supabase user and confirms they hold an admin role. */
export async function getSupabaseAdmin(supabase: SupabaseClient): Promise<AdminIdentity | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  let profile = (
    await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  ).data;

  // Fallback to service role lookup if unprivileged client was blocked by RLS
  if (!profile && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
      );
      profile = (await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()).data;
    } catch {
      // ignore fallback error
    }
  }

  if (!profile || !(ADMIN_ROLES as readonly string[]).includes(profile.role)) return null;

  return { id: user.id, email: user.email || '', role: profile.role, mode: 'supabase' };
}

// ---------------------------------------------------------------------------
// Development-mode signed session cookie
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(): Promise<CryptoKey | null> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** True when local dev login is fully configured (credentials + signing secret). */
export function isDevLoginConfigured(): boolean {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return Boolean(
    process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && secret && secret.length >= 32
  );
}

export async function signDevSession(email: string): Promise<string | null> {
  const key = await getHmacKey();
  if (!key) return null;
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + DEV_SESSION_MAX_AGE_SECONDS })
    )
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifyDevSession(token: string | undefined): Promise<AdminIdentity | null> {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const key = await getHmacKey();
  if (!key) return null;

  try {
    const signatureBytes = fromBase64Url(signature);
    // Reject non-canonical encodings (e.g. altered padding bits) so a token has exactly one valid form.
    if (toBase64Url(signatureBytes) !== signature) return null;

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(payload)
    );
    if (!valid) return null;

    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (typeof data.email !== 'string' || typeof data.exp !== 'number') return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;

    return { id: null, email: data.email, role: 'admin', mode: 'development' };
  } catch {
    return null;
  }
}
