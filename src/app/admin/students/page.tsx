'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  UserPlus,
  Users,
  Building2,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  X,
  ArrowRight,
  Camera,
} from 'lucide-react';
import { usePolling } from '@/lib/hooks/usePolling';

interface Student {
  id: string;
  name: string;
  college: string | null;
  attended: boolean;
  attended_at: string | null;
  photo_url: string | null;
  registered_at: string | null;
}

type StatusFilter = 'all' | 'attended' | 'pending';
type SortKey = 'recent' | 'name' | 'college';

const AVATAR_COLORS = ['#2864B4', '#16835D', '#B7791F', '#7A3FB5', '#C0393A', '#0E7490', '#9A4B1F'];

function colorFor(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
  // Use only words that start with a letter (skips numbers and symbols like "<").
  const parts = name.trim().split(/\s+/).filter((w) => /^[A-Za-zÀ-￾]/.test(w));
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function timeAgo(iso: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function isToday(iso: string | null) {
  return !!iso && new Date(iso).toDateString() === new Date().toDateString();
}

export default function StudentRegistrationPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [college, setCollege] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('recent');

  const load = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/attendees?category=student&_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        throw new Error(
          res.status === 401
            ? 'Your session has expired. Please sign in again.'
            : data?.error || 'Could not load students. Retrying shortly.'
        );
      }
      setStudents(data.attendees || []);
      setError(null);
    } catch (e: any) {
      // Keep showing the last good list; just flag that the refresh failed.
      setError(e.message || 'Could not load students.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Refresh every 20 s, but only while this tab is visible
  usePolling(() => load(true), 20000);

  const collegeStats = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((s) => {
      const c = s.college || 'Not specified';
      map.set(c, (map.get(c) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [students]);

  const total = students.length;
  const today = students.filter((s) => isToday(s.registered_at)).length;
  const checkedIn = students.filter((s) => s.attended).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = students.filter((s) => {
      if (college !== 'all' && (s.college || 'Not specified') !== college) return false;
      if (status === 'attended' && !s.attended) return false;
      if (status === 'pending' && s.attended) return false;
      return !q || s.name.toLowerCase().includes(q) || (s.college || '').toLowerCase().includes(q);
    });
    return list.sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : sort === 'college'
        ? (a.college || '').localeCompare(b.college || '') || a.name.localeCompare(b.name)
        : new Date(b.registered_at || 0).getTime() - new Date(a.registered_at || 0).getTime()
    );
  }, [students, search, college, status, sort]);

  const kpis = [
    { label: 'Registered students', value: total, icon: Users, tint: '#2864B4' },
    { label: 'Registered today', value: today, icon: UserPlus, tint: '#16835D' },
    { label: 'Colleges', value: collegeStats.length, icon: Building2, tint: '#7A3FB5' },
    { label: 'Checked in', value: checkedIn, icon: CheckCircle2, tint: '#B7791F' },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142D4E]">Student Registration</h1>
          <p className="text-sm text-[#667085] mt-1">
            Students register themselves at the kiosk with their name and college. New students appear here instantly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            disabled={isLoading}
            className="h-9 px-3 rounded-lg border border-[#D0D5DD] bg-white text-xs font-semibold text-[#344054] flex items-center gap-1.5 hover:bg-[#F7F9FC] disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link
            href="/kiosk"
            target="_blank"
            className="h-9 px-3.5 rounded-lg bg-[#142D4E] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#1E4D8C]"
          >
            Open kiosk <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-[#C0393A]/30 bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(({ label, value, icon: Icon, tint }) => (
          <div key={label} className="bg-white border border-[#E4E9F0] rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#667085]">{label}</span>
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${tint}1A`, color: tint }}>
                <Icon className="w-4 h-4" />
              </span>
            </div>
            <p className="text-3xl font-extrabold text-[#142D4E] mt-2 tabular-nums">{isLoading ? '–' : value}</p>
          </div>
        ))}
      </div>

      {/* Colleges */}
      {collegeStats.length > 0 && (
        <div className="bg-white border border-[#E4E9F0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-[#142D4E]">Students by college</h2>
            {college !== 'all' && (
              <button onClick={() => setCollege('all')} className="text-xs font-semibold text-[#2864B4] hover:underline">
                Show all colleges
              </button>
            )}
          </div>
          <div className="space-y-2">
            {collegeStats.slice(0, 6).map(([name, count]) => {
              const active = college === name;
              return (
                <button
                  key={name}
                  onClick={() => setCollege(active ? 'all' : name)}
                  className={`w-full text-left rounded-lg px-2.5 py-1.5 transition-colors ${active ? 'bg-[#EAF2FC]' : 'hover:bg-[#F7F9FC]'}`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-[#182230] truncate pr-3">{name}</span>
                    <span className="text-[#667085] tabular-nums">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#EEF1F5] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(count / total) * 100}%`, background: colorFor(name) }} />
                  </div>
                </button>
              );
            })}
            {collegeStats.length > 6 && (
              <p className="text-[11px] text-[#667085] px-2.5">+ {collegeStats.length - 6} more (use the college filter below)</p>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student or college"
            className="w-full h-10 pl-9 pr-9 rounded-lg border border-[#D0D5DD] bg-white text-sm outline-none focus:border-[#2864B4] focus:ring-2 focus:ring-[#2864B4]/20"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#667085] hover:text-[#182230]">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <select
          value={college}
          onChange={(e) => setCollege(e.target.value)}
          aria-label="Filter by college"
          className="h-10 px-3 rounded-lg border border-[#D0D5DD] bg-white text-sm max-w-[220px]"
        >
          <option value="all">All colleges</option>
          {collegeStats.map(([name]) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <div className="inline-flex p-1 bg-[#EEF1F5] rounded-lg border border-[#E4E9F0]">
          {([['all', 'All'], ['attended', 'Checked in'], ['pending', 'Not yet']] as [StatusFilter, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setStatus(k)}
              className={`px-3 h-8 text-xs font-semibold rounded-md transition-all ${status === k ? 'bg-white text-[#142D4E] shadow-sm' : 'text-[#667085] hover:text-[#182230]'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort students"
          className="h-10 px-3 rounded-lg border border-[#D0D5DD] bg-white text-sm"
        >
          <option value="recent">Newest first</option>
          <option value="name">Name A–Z</option>
          <option value="college">College A–Z</option>
        </select>
      </div>

      {/* List */}
      <div className="bg-white border border-[#E4E9F0] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E4E9F0] text-xs text-[#667085]">
          Showing <strong className="text-[#142D4E]">{visible.length}</strong> of {total} students
        </div>

        {isLoading ? (
          <ul className="divide-y divide-[#E4E9F0]">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="px-5 py-4 flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-[#EEF1F5]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 rounded bg-[#EEF1F5]" />
                  <div className="h-3 w-56 rounded bg-[#F2F4F7]" />
                </div>
              </li>
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="w-12 h-12 rounded-full bg-[#EAF2FC] text-[#2864B4] flex items-center justify-center mx-auto mb-3">
              <UserPlus className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#142D4E]">
              {total === 0 ? 'No students registered yet' : 'No students match your filters'}
            </h3>
            <p className="text-sm text-[#667085] mt-1 max-w-sm mx-auto">
              {total === 0
                ? 'Open the kiosk and have a student check in. They are registered automatically on their first check-in.'
                : 'Try a different search, college or status.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#E4E9F0]">
            {visible.map((s) => (
              <li key={s.id} className="px-5 py-3.5 flex items-center gap-3.5 hover:bg-[#F7F9FC]/70 transition-colors">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ background: colorFor(s.college || s.name) }}
                  aria-hidden
                >
                  {initials(s.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#182230] truncate">{s.name}</p>
                  <p className="text-xs text-[#667085] truncate">{s.college || 'College not specified'}</p>
                </div>
                <div className="hidden sm:block text-right text-[11px] text-[#667085] w-28 shrink-0">
                  <span className="block text-[#98A2B3]">Registered</span>
                  {timeAgo(s.registered_at)}
                </div>
                <div className="shrink-0">
                  {s.attended ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#16835D] bg-[#16835D]/10 border border-[#16835D]/20 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Checked in
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B7791F] bg-[#B7791F]/10 border border-[#B7791F]/20 px-2 py-0.5 rounded-full">
                      <Clock className="w-3 h-3" /> Not yet
                    </span>
                  )}
                </div>
                <div className="w-10 h-10 rounded-md overflow-hidden bg-[#EEF1F5] border border-[#E4E9F0] shrink-0 flex items-center justify-center text-[#98A2B3]">
                  {s.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.photo_url} alt={`${s.name} check-in`} className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
