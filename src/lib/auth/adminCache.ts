/**
 * Short-lived, signed "this browser was just verified as an admin" cookie.
 *
 * Why: verifying an admin takes two network round trips to Supabase (auth + profile). The middleware runs at the
 * edge, far from the database, and every admin request used to pay that cost twice (middleware, then the route).
 * After one successful verification we remember the result for a few minutes in a cookie signed with a server-side
 * secret, so the next requests skip the network entirely.
 *
 * Safe to import from the Edge runtime (uses Web Crypto only).
 */
import { getSupabaseServiceKey } from '@/lib/supabase/config';
import type { AdminIdentity } from './adminSession';

export const ADMIN_CACHE_COOKIE = 'mrf_admin_ok';
export const ADMIN_CACHE_TTL_SECONDS = 180; // admin removals take at most this long to apply

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

async function getKey(): Promise<CryptoKey | null> {
  const secret = getSupabaseServiceKey();
  if (!secret) return null; // no server secret: caching is simply disabled
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(`mrf-admin-ok:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Returns a signed cookie value for an already verified admin, or null if signing is not possible. */
export async function signAdminCache(admin: AdminIdentity): Promise<string | null> {
  const key = await getKey();
  if (!key || admin.mode !== 'supabase') return null;
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        i: admin.id,
        e: admin.email,
        r: admin.role,
        x: Math.floor(Date.now() / 1000) + ADMIN_CACHE_TTL_SECONDS,
      })
    )
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  return `${payload}.${toBase64Url(sig)}`;
}

/** Verifies the cookie signature and expiry. Returns the cached identity, or null. */
export async function verifyAdminCache(token: string | undefined): Promise<AdminIdentity | null> {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const key = await getKey();
  if (!key) return null;

  try {
    const sigBytes = fromBase64Url(signature);
    if (toBase64Url(sigBytes) !== signature) return null;
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload));
    if (!ok) return null;

    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (typeof data.x !== 'number' || data.x < Math.floor(Date.now() / 1000)) return null;
    if (typeof data.e !== 'string' || typeof data.r !== 'string') return null;
    return { id: typeof data.i === 'string' ? data.i : null, email: data.e, role: data.r, mode: 'supabase' };
  } catch {
    return null;
  }
}

export const adminCacheCookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: ADMIN_CACHE_TTL_SECONDS,
};
