import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { signAdminCache, verifyAdminCache, ADMIN_CACHE_TTL_SECONDS } from './adminCache';
import type { AdminIdentity } from './adminSession';

const admin: AdminIdentity = { id: 'u-1', email: 'admin@example.test', role: 'super_admin', mode: 'supabase' };
const OLD = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key-0123456789';
});
afterAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = OLD;
});

describe('verified-admin cache cookie', () => {
  it('round-trips an admin identity', async () => {
    const value = await signAdminCache(admin);
    expect(value).toBeTruthy();
    expect(await verifyAdminCache(value!)).toEqual(admin);
  });

  it('rejects a tampered signature', async () => {
    const value = (await signAdminCache(admin))!;
    const [payload, sig] = value.split('.');
    const bad = `${payload}.${sig.slice(0, -2)}${sig.endsWith('A') ? 'B' : 'A'}x`;
    expect(await verifyAdminCache(bad)).toBeNull();
  });

  it('rejects a swapped payload that keeps the old signature', async () => {
    const value = (await signAdminCache(admin))!;
    const sig = value.split('.')[1];
    const forged = Buffer.from(JSON.stringify({ i: 'u-1', e: 'evil@x', r: 'super_admin', x: 9999999999 })).toString('base64url');
    expect(await verifyAdminCache(`${forged}.${sig}`)).toBeNull();
  });

  it('rejects an expired cookie', async () => {
    const value = (await signAdminCache(admin))!;
    const realNow = Date.now;
    Date.now = () => realNow() + (ADMIN_CACHE_TTL_SECONDS + 5) * 1000;
    try {
      expect(await verifyAdminCache(value)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it('rejects garbage and empty values', async () => {
    expect(await verifyAdminCache(undefined)).toBeNull();
    expect(await verifyAdminCache('')).toBeNull();
    expect(await verifyAdminCache('not-a-token')).toBeNull();
    expect(await verifyAdminCache('a.b')).toBeNull();
  });

  it('is disabled (never trusts anything) when the server key is missing', async () => {
    const value = (await signAdminCache(admin))!;
    const keep = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    try {
      expect(await signAdminCache(admin)).toBeNull();
      expect(await verifyAdminCache(value)).toBeNull();
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = keep;
    }
  });

  it('does not issue a cookie for development-mode admins', async () => {
    expect(await signAdminCache({ ...admin, mode: 'development' })).toBeNull();
  });
});
