'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Trash2, Users, ClipboardList, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';

interface Counts {
  people: number;
  attendance: number;
  photos: number;
}

const CONFIRM_PHRASE = 'DELETE ALL';

/** "Danger zone": removes ALL students, attendance records and photos after a typed confirmation. */
export function RemoveAllData() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const close = () => {
    if (isRemoving) return;
    setIsOpen(false);
    setTyped('');
    setError(null);
  };

  const remove = async () => {
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
      setDone(
        `Removed ${d.people ?? 0} students, ${d.attendance_records ?? 0} attendance records and ${
          d.photo_files ?? d.attendance_photos ?? 0
        } photos.`
      );
      setIsOpen(false);
      setTyped('');
      await loadCounts();
    } catch (e: any) {
      setError(e.message || 'Could not remove the data.');
    } finally {
      setIsRemoving(false);
    }
  };

  const items = [
    { icon: Users, label: 'Students', value: counts?.people },
    { icon: ClipboardList, label: 'Attendance records', value: counts?.attendance },
    { icon: Camera, label: 'Photos', value: counts?.photos },
  ];

  return (
    <>
      <Card className="border-[#C0393A]/40">
        <CardHeader className="bg-[#FEF3F2]">
          <CardTitle className="text-base flex items-center gap-2 text-[#B42318]">
            <AlertTriangle className="w-4 h-4" /> Danger Zone: Remove All Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-[#475467] leading-relaxed">
            Permanently deletes <strong>every student</strong>, <strong>all attendance records</strong> and{' '}
            <strong>all captured photos</strong>. Use it to start fresh, for example after testing or at the end of an
            event. The event and session settings, admin accounts and the audit log are kept.
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

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDone(null);
                setIsOpen(true);
              }}
              className="border-[#C0393A]/40 text-[#B42318] hover:bg-[#FEF3F2] hover:border-[#C0393A]"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Remove all data…
            </Button>
          </div>
        </CardContent>
      </Card>

      <Modal isOpen={isOpen} onClose={close} title="Remove all data?" maxWidth="md">
        <div className="space-y-4">
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
              Kiosks that are offline may still hold check-ins that were not uploaded yet. Those would register again when
              the kiosk reconnects.
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
              onClick={remove}
              isLoading={isRemoving}
              disabled={typed !== CONFIRM_PHRASE}
              className="bg-[#C0393A] hover:bg-[#A02E2F] text-white"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Permanently remove all data
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
