import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDevStorage } from '@/lib/db/devStore';
import { isPlaceholderMode } from '@/lib/auth/adminSession';
import { normalizeForMatch } from '@/lib/utils/normalization';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Collapses spelling variants ("MIT Mysore", "mit  mysore.") into one entry, keeping the spelling
 * most students used, and orders the list by how often each college has been used.
 */
function rankColleges(raw: (string | null | undefined)[]): string[] {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const value of raw) {
    const display = (value || '').replace(/\s+/g, ' ').trim();
    const key = normalizeForMatch(display);
    if (!key) continue;
    const g = groups.get(key) || { count: 0, spellings: new Map<string, number>() };
    g.count += 1;
    g.spellings.set(display, (g.spellings.get(display) || 0) + 1);
    groups.set(key, g);
  }
  return Array.from(groups.values())
    .map((g) => ({
      count: g.count,
      name: Array.from(g.spellings.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 300)
    .map((c) => c.name);
}

/** Public: the college names students have already used, so the next student can pick one. Names only. */
export async function GET() {
  try {
    if (isPlaceholderMode()) {
      const colleges = rankColleges(
        getDevStorage().people.filter((p) => p.category === 'student').map((p) => p.college)
      );
      return NextResponse.json({ colleges }, { headers: NO_STORE });
    }

    const { data, error } = await createAdminClient()
      .from('people')
      .select('college')
      .eq('category', 'student')
      .limit(10000);
    if (error) return NextResponse.json({ colleges: [] }, { status: 503, headers: NO_STORE });

    return NextResponse.json({ colleges: rankColleges((data || []).map((r: any) => r.college)) }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ colleges: [] }, { status: 503, headers: NO_STORE });
  }
}
