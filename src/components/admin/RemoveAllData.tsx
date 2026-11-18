'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Trash2, Users, ClipboardList, Camera, Search, Building2, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { normalizeForMatch } from '@/lib/utils/normalization';

interface Counts {
  people: number;
  attendance: number;
  photos: number;
}

interface StudentRow {
  id: string;
  name: string;
  college: string;
  registeredAt: string | null;
  checkIns: number;
  photos: number;
}

type Mode = 'choose' | 'all';

const CONFIRM_PHRASE = 'DELETE ALL';

const formatDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/**
 * "Danger zone": delete chosen students (picked from a scrollable list, or a whole college at once), or remove
 * ALL students, attendance records and photos after a typed confirmation.
 */
export function RemoveAllData() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('choose');
  const [typed, setTyped] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // "Choose students"
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [college, setCollege] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reset-data?_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.counts) throw new Error(data?.error || 'Could not load the current totals.');
      setCounts(data.counts);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message || 'Could not load the current totals.');
    }
  }, []);

  const loadStudents = useCallback(async () => {
    setListError(null);
    try {
      const res = await fetch(`/api/admin/reset-data?list=1&_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.students)) throw new Error(data?.error || 'Could not load the students.');
      setStudents(data.students);
      // drop selections for students that no longer exist
      setSelected((prev) => new Set(Array.from(prev).filter((id) => data.students.some((s: StudentRow) => s.id === id))));
    } catch (e: any) {
      setListError(e.message || 'Could not load the students.');
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // Colleges, most students first, for the "whole college" filter
  const colleges = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const s of students || []) {
      const key = normalizeForMatch(s.college) || '(no college)';
      const entry = map.get(key);
      if (entry) entry.count++;
      else map.set(key, { label: s.college || '(no college)', count: 1 });
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [students]);

  const visible = useMemo(() => {
    const q = normalizeForMatch(search);
    return (students || []).filter((s) => {
      if (college && (normalizeForMatch(s.college) || '(no college)') !== college) return false;
      if (!q) return true;
      return normalizeForMatch(s.name).includes(q) || normalizeForMatch(s.college).includes(q);
    });
  }, [students, search, college]);

  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.has(s.id));
  const chosen = useMemo(() => (students || []).filter((s) => selected.has(s.id)), [students, selected]);
  const chosenCheckIns = chosen.reduce((n, s) => n + s.checkIns, 0);
  const chosenPhotos = chosen.reduce((n, s) => n + s.photos, 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((s) => next.delete(s.id));
      else visible.forEach((s) => next.add(s.id));
      return next;
    });

  const open = (m: Mode) => {
    setDone(null);
    setError(null);
    setMode(m);
    setIsOpen(true);
    if (m === 'choose') loadStudents();
  };

  const close = () => {
    if (isRemoving) return;
    setIsOpen(false);
    setTyped('');
    setError(null);
    setConfirming(false);
  };

  const finish = async (message: string) => {
    setDone(message);
    setIsOpen(false);
    setTyped('');
    setConfirming(false);
    setSelected(new Set());
    await Promise.all([loadCounts(), loadStudents()]);
  };

  const removeAll = async () => {
    if (typed !== CONFIRM_PHRASE || isRemoving) return;
    setIsRemoving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'PURGE_ALL_DATA' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not remove the data.');
      const d = data.deleted || {};
      await finish(
        `Removed ${d.people ?? 0} students, ${d.attendance_records ?? 0} attendance records and ${
          d.photo_files ?? d.attendance_photos ?? 0
        } photos.`
      );
    } catch (e: any) {
      setError(e.message || 'Could not remove the data.');
    } finally {
      setIsRemoving(false);
    }
  };

  const removeSelected = async () => {
    if (selected.size === 0 || isRemoving) return;
    setIsRemoving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE_SELECTED', ids: Array.from(selected) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not delete the selected students.');
      const d = data.deleted || {};
      await finish(
        `Deleted ${d.people ?? 0} selected student${d.people === 1 ? '' : 's'}, ${d.attendance_records ?? 0} attendance record${
          d.attendance_records === 1 ? '' : 's'
        } and ${d.photo_files ?? d.attendance_photos ?? 0} photo${(d.photo_files ?? d.attendance_photos) === 1 ? '' : 's'}.`
      );
    } catch (e: any) {
      setError(e.message || 'Could not delete the selected students.');
      setConfirming(false);
    } finally {
      setIsRemoving(false);
    }
  };

  const items = [
    { icon: Users, label: 'Students', value: counts?.people },
    { icon: ClipboardList, label: 'Attendance records', value: counts?.attendance },
    { icon: Camera, label: 'Photos', value: counts?.photos },
  ];

  const tabClass = (m: Mode) =>
    `flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
      mode === m ? 'bg-white text-[#B42318] shadow-sm' : 'text-[#667085] hover:text-[#344054]'
    }`;

  return (
    <>
      <Card className="border-[#C0393A]/40">
        <CardHeader className="bg-[#FEF3F2]">
          <CardTitle className="text-base flex items-center gap-2 text-[#B42318]">
            <AlertTriangle className="w-4 h-4" /> Danger Zone: Remove Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-[#475467] leading-relaxed">
            Delete <strong>chosen students</strong> (for example test entries) or <strong>everything</strong>: every
            student, all attendance records and all captured photos. A deleted student&apos;s attendance and photo are
            deleted with them. The event and session settings, admin and teacher accounts and the audit log are kept.
          </p>

          <div className="grid grid-cols-3 gap-3">
            {items.map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-lg border border-[#E4E9F0] bg-[#F7F9FC] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#667085]">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </div>
                <p className="mt-1 text-xl font-extrabold text-[#142D4E] tabular-nums">{value ?? '–'}</p>
              </div>
            ))}
          </div>

          {loadError && <p className="text-xs text-[#B42318]">{loadError}</p>}

          {done && (
            <div className="p-3 bg-[#16835D]/10 border border-[#16835D]/20 text-[#16835D] rounded-lg text-xs flex items-center gap-2" role="status">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{done}</span>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => open('choose')}
              className="border-[#C0393A]/40 text-[#B42318] hover:bg-[#FEF3F2] hover:border-[#C0393A]"
            >
              <ListChecks className="w-4 h-4 mr-2" /> Choose students to delete…
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => open('all')}
              className="border-[#C0393A]/40 text-[#B42318] hover:bg-[#FEF3F2] hover:border-[#C0393A]"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Remove all data…
            </Button>
          </div>
        </CardContent>
      </Card>

      <Modal isOpen={isOpen} onClose={close} title="Remove data" maxWidth="xl">
        <div className="space-y-4">
          <div className="flex gap-1 rounded-lg bg-[#F2F4F7] p-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'choose'}
              className={tabClass('choose')}
              onClick={() => {
                setMode('choose');
                setError(null);
                if (!students) loadStudents();
              }}
              disabled={isRemoving}
            >
              <ListChecks className="w-3.5 h-3.5" /> Choose students
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'all'}
              className={tabClass('all')}
              onClick={() => {
                setMode('all');
                setError(null);
                setConfirming(false);
              }}
              disabled={isRemoving}
            >
              <Trash2 className="w-3.5 h-3.5" /> Everything
            </button>
          </div>

          {mode === 'choose' ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A2B3]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or college"
                    className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#D0D5DD] text-sm outline-none focus:border-[#2864B4] focus:ring-2 focus:ring-[#2864B4]/20"
                  />
                </div>
                <div className="relative sm:w-60">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A2B3]" />
                  <select
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                    aria-label="Filter by college"
                    className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#D0D5DD] bg-white text-sm outline-none focus:border-[#2864B4] focus:ring-2 focus:ring-[#2864B4]/20"
                  >
                    <option value="">All colleges</option>
                    {colleges.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label} ({c.count})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-[#E4E9F0]">
                <label className="flex cursor-pointer items-center gap-3 border-b border-[#E4E9F0] bg-[#F7F9FC] px-3 py-2 text-xs font-semibold text-[#344054]">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleVisible}
                    disabled={visible.length === 0}
                    className="h-4 w-4 accent-[#C0393A]"
                  />
                  <span className="flex-1">
                    {allVisibleSelected ? 'Unselect' : 'Select'} all {visible.length} shown
                    {college ? ' from this college' : ''}
                  </span>
                  <span className="text-[#B42318]">{selected.size} selected</span>
                </label>

                <div className="max-h-[46vh] overflow-y-auto">
                  {listError ? (
                    <p className="p-4 text-xs text-[#B42318]">{listError}</p>
                  ) : students === null ? (
                    <p className="p-4 text-xs text-[#667085]">Loading students…</p>
                  ) : visible.length === 0 ? (
                    <p className="p-4 text-xs text-[#667085]">
                      {students.length === 0 ? 'There are no students to delete.' : 'No students match your search.'}
                    </p>
                  ) : (
                    <ul>
                      {visible.map((s) => {
                        const isOn = selected.has(s.id);
                        return (
                          <li key={s.id}>
                            <label
                              className={`flex cursor-pointer items-center gap-3 border-b border-[#F2F4F7] px-3 py-2.5 text-sm last:border-0 ${
                                isOn ? 'bg-[#FEF3F2]' : 'hover:bg-[#F9FAFB]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isOn}
                                onChange={() => toggle(s.id)}
                                className="h-4 w-4 shrink-0 accent-[#C0393A]"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-[#182230]">{s.name}</span>
                                <span className="block truncate text-xs text-[#667085]">{s.college || '(no college)'}</span>
                              </span>
                              <span className="hidden shrink-0 text-right text-[11px] text-[#667085] sm:block">
                                <span className="block">{formatDate(s.registeredAt)}</span>
                                <span className="block">
                                  {s.checkIns} check-in{s.checkIns === 1 ? '' : 's'} · {s.photos} photo{s.photos === 1 ? '' : 's'}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {confirming && selected.size > 0 && (
                <div className="p-3 bg-[#FEF3F2] border border-[#C0393A]/30 rounded-lg text-xs text-[#7A271A] space-y-1">
                  <p className="font-bold text-sm text-[#B42318] flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> This cannot be undone
                  </p>
                  <p>
                    This will permanently delete{' '}
                    <strong>
                      {chosen.length} student{chosen.length === 1 ? '' : 's'}, {chosenCheckIns} attendance record
                      {chosenCheckIns === 1 ? '' : 's'} and {chosenPhotos} photo{chosenPhotos === 1 ? '' : 's'}
                    </strong>{' '}
                    from the database.
                  </p>
                </div>
              )}

              {error && (
                <div role="alert" className="p-3 bg-[#FEF3F2] border border-[#C0393A]/30 rounded-lg text-xs text-[#B42318]">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={confirming ? () => setConfirming(false) : close}
                  disabled={isRemoving}
                >
                  {confirming ? 'Back' : 'Cancel'}
                </Button>
                {confirming ? (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={removeSelected}
                    isLoading={isRemoving}
                    className="bg-[#C0393A] hover:bg-[#A02E2F] text-white"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Yes, delete {selected.size} student{selected.size === 1 ? '' : 's'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setConfirming(true)}
                    disabled={selected.size === 0}
                    className="bg-[#C0393A] hover:bg-[#A02E2F] text-white"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete selected ({selected.size})
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="p-3 bg-[#FEF3F2] border border-[#C0393A]/30 rounded-lg text-xs text-[#7A271A] space-y-1.5">
                <p className="font-bold text-sm text-[#B42318] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> This cannot be undone
                </p>
                <p>
                  This will permanently delete{' '}
                  <strong>
                    {counts?.people ?? '…'} students, {counts?.attendance ?? '…'} attendance records and{' '}
                    {counts?.photos ?? '…'} photos
                  </strong>
                  .
                </p>
                <p>
                  Kiosks that are offline may still hold check-ins that were not uploaded yet. Those would register again
                  when the kiosk reconnects.
                </p>
              </div>

              <div>
                <label htmlFor="confirm-phrase" className="block text-xs font-semibold text-[#344054] mb-1.5">
                  Type <span className="font-mono font-bold text-[#B42318]">{CONFIRM_PHRASE}</span> to confirm
                </label>
                <input
                  id="confirm-phrase"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full h-10 px-3 rounded-lg border border-[#D0D5DD] text-sm outline-none focus:border-[#C0393A] focus:ring-2 focus:ring-[#C0393A]/20"
                  placeholder={CONFIRM_PHRASE}
                />
              </div>

              {error && (
                <div role="alert" className="p-3 bg-[#FEF3F2] border border-[#C0393A]/30 rounded-lg text-xs text-[#B42318]">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <Button type="button" variant="outline" onClick={close} disabled={isRemoving}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={removeAll}
                  isLoading={isRemoving}
                  disabled={typed !== CONFIRM_PHRASE}
                  className="bg-[#C0393A] hover:bg-[#A02E2F] text-white"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Permanently remove all data
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
