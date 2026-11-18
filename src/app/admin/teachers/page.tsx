'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  UserPlus,
  KeyRound,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  registrations: number;
}

interface Credentials {
  name: string;
  email: string;
  password: string;
  reset?: boolean;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** A random, easy-to-read 12 character password (no 0/O/1/l/I). */
function generatePassword(): string {
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? '?' : (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-[#D0D5DD] bg-white text-sm outline-none focus:border-[#2864B4] focus:ring-2 focus:ring-[#2864B4]/20';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable: the value is visible and can be copied by hand
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-[#D0D5DD] bg-white px-2 py-1 text-[11px] font-semibold text-[#344054] hover:bg-[#F7F9FC]"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="w-3 h-3 text-[#16835D]" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // create form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  // reset / remove dialogs
  const [resetFor, setResetFor] = useState<Teacher | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [removeFor, setRemoveFor] = useState<Teacher | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/teachers?_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.teachers) throw new Error(data?.error || 'Could not load the teachers.');
      setTeachers(data.teachers);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message || 'Could not load the teachers.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    try {
      const res = await fetch('/api/admin/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name, email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not create the teacher.');
      setCredentials({ name: data.teacher.full_name, email: data.teacher.email, password });
      setName('');
      setEmail('');
      setPassword('');
      setShowPassword(false);
      await load();
    } catch (err: any) {
      setFormError(err.message || 'Could not create the teacher.');
    } finally {
      setCreating(false);
    }
  };

  const submitReset = async () => {
    if (!resetFor) return;
    setBusy(true);
    setDialogError(null);
    try {
      const res = await fetch('/api/admin/teachers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resetFor.id, password: newPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not reset the password.');
      setCredentials({ name: resetFor.full_name, email: resetFor.email, password: newPassword, reset: true });
      setResetFor(null);
      setNewPassword('');
    } catch (err: any) {
      setDialogError(err.message || 'Could not reset the password.');
    } finally {
      setBusy(false);
    }
  };

  const submitRemove = async () => {
    if (!removeFor) return;
    setBusy(true);
    setDialogError(null);
    try {
      const res = await fetch(`/api/admin/teachers?id=${encodeURIComponent(removeFor.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not remove the teacher.');
      setRemoveFor(null);
      await load();
    } catch (err: any) {
      setDialogError(err.message || 'Could not remove the teacher.');
    } finally {
      setBusy(false);
    }
  };

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142D4E]">Teachers</h1>
          <p className="text-sm text-[#667085] mt-1 max-w-2xl">
            Create a login for each teacher. They sign in at the same login page and get the same dashboard, but only see
            (and show on their Live Display) the students they registered themselves.
          </p>
        </div>
        <button
          onClick={() => load()}
          className="h-9 px-3 rounded-lg border border-[#D0D5DD] bg-white text-xs font-semibold text-[#344054] flex items-center gap-1.5 hover:bg-[#F7F9FC]"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Credentials just created or reset */}
      {credentials && (
        <div className="rounded-xl border border-[#16835D]/30 bg-[#EAF7EE] p-5" role="status">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#16835D] shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#14532D]">
                {credentials.reset ? 'New password set for' : 'Teacher created:'} {credentials.name}
              </p>
              <p className="text-xs text-[#166534] mt-0.5">
                Give these to the teacher now. The password is not shown again after you close this.
              </p>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
                <div className="rounded-lg bg-white border border-[#BBF7D0] px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#667085]">Email</dt>
                    <dd className="font-mono text-[#182230] truncate">{credentials.email}</dd>
                  </div>
                  <CopyButton text={credentials.email} label="email" />
                </div>
                <div className="rounded-lg bg-white border border-[#BBF7D0] px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#667085]">Password</dt>
                    <dd className="font-mono text-[#182230] truncate">{credentials.password}</dd>
                  </div>
                  <CopyButton text={credentials.password} label="password" />
                </div>
              </dl>
            </div>
            <button
              onClick={() => setCredentials(null)}
              className="text-xs font-semibold text-[#166534] hover:underline shrink-0"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      <form onSubmit={create} className="bg-white border border-[#E4E9F0] rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-[#142D4E] flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[#2864B4]" /> Add a teacher
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="t-name" className="block text-xs font-semibold text-[#344054] mb-1.5">Full name</label>
            <input id="t-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Anita Rao" autoComplete="off" maxLength={80} required />
          </div>
          <div>
            <label htmlFor="t-email" className="block text-xs font-semibold text-[#344054] mb-1.5">Email (their login)</label>
            <input id="t-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="teacher@example.com" autoComplete="off" required />
          </div>
          <div>
            <label htmlFor="t-pass" className="block text-xs font-semibold text-[#344054] mb-1.5">Password (you choose)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="t-pass"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} pr-10 font-mono`}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 w-10 flex items-center justify-center text-[#667085] hover:text-[#142D4E]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPassword(generatePassword());
                  setShowPassword(true);
                }}
                className="h-10 px-3 rounded-lg border border-[#D0D5DD] bg-white text-xs font-semibold text-[#344054] flex items-center gap-1.5 hover:bg-[#F7F9FC]"
                title="Generate a random password"
              >
                <Wand2 className="w-3.5 h-3.5" /> Generate
              </button>
            </div>
          </div>
        </div>
        {formError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-[#C0393A]/30 bg-[#FEF3F2] px-3 py-2.5 text-xs text-[#B42318]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{formError}</span>
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={creating}
            className="h-10 px-5 rounded-lg bg-[#142D4E] text-white text-sm font-semibold hover:bg-[#1E4D8C] disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create teacher'}
          </button>
        </div>
      </form>

      {/* List */}
      <div className="bg-white border border-[#E4E9F0] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E4E9F0] text-xs text-[#667085] flex items-center gap-2">
          <Users className="w-4 h-4 text-[#2864B4]" />
          <span>
            <strong className="text-[#142D4E]">{teachers.length}</strong> teacher{teachers.length === 1 ? '' : 's'}
          </span>
        </div>

        {loadError && (
          <div role="alert" className="m-4 rounded-lg border border-[#C0393A]/30 bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
            {loadError}
          </div>
        )}

        {isLoading ? (
          <div className="p-8 text-center text-xs text-[#667085]">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#2864B4]" /> Loading teachers…
          </div>
        ) : teachers.length === 0 && !loadError ? (
          <div className="px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-[#EAF2FC] text-[#2864B4] flex items-center justify-center mx-auto mb-3">
              <UserPlus className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#142D4E]">No teachers yet</h3>
            <p className="text-sm text-[#667085] mt-1">Add the first one with the form above.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#E4E9F0]">
            {teachers.map((t) => (
              <li key={t.id} className="px-5 py-4 flex flex-wrap items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[#142D4E] text-white flex items-center justify-center text-xs font-bold shrink-0" aria-hidden>
                  {initials(t.full_name || t.email)}
                </div>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-sm font-bold text-[#182230] truncate">{t.full_name || '(no name)'}</p>
                  <p className="text-xs text-[#667085] truncate">{t.email}</p>
                </div>
                <div className="text-xs text-[#667085] w-32">
                  <span className="block text-[#98A2B3]">Students registered</span>
                  <strong className="text-[#142D4E] text-sm tabular-nums">{t.registrations}</strong>
                </div>
                <div className="text-xs text-[#667085] w-40">
                  <span className="block text-[#98A2B3]">Last sign-in</span>
                  {fmt(t.last_sign_in_at)}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => {
                      setDialogError(null);
                      setNewPassword(generatePassword());
                      setResetFor(t);
                    }}
                    className="h-8 px-3 rounded-lg border border-[#D0D5DD] bg-white text-xs font-semibold text-[#344054] flex items-center gap-1.5 hover:bg-[#F7F9FC]"
                  >
                    <KeyRound className="w-3.5 h-3.5" /> Reset password
                  </button>
                  <button
                    onClick={() => {
                      setDialogError(null);
                      setRemoveFor(t);
                    }}
                    className="h-8 px-3 rounded-lg border border-[#C0393A]/30 bg-white text-xs font-semibold text-[#B42318] flex items-center gap-1.5 hover:bg-[#FEF3F2]"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Reset password */}
      <Modal isOpen={!!resetFor} onClose={() => !busy && setResetFor(null)} title="Reset password" maxWidth="md">
        <div className="space-y-4">
          <p className="text-xs text-[#667085]">
            Set a new password for <strong className="text-[#182230]">{resetFor?.full_name}</strong> ({resetFor?.email}). Their old
            password stops working immediately.
          </p>
          <div className="flex gap-2">
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={`${inputCls} font-mono`}
              aria-label="New password"
              minLength={8}
              maxLength={72}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setNewPassword(generatePassword())}
              className="h-10 px-3 rounded-lg border border-[#D0D5DD] bg-white text-xs font-semibold text-[#344054] flex items-center gap-1.5 hover:bg-[#F7F9FC]"
            >
              <Wand2 className="w-3.5 h-3.5" /> Generate
            </button>
          </div>
          {dialogError && <p role="alert" className="text-xs text-[#B42318]">{dialogError}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setResetFor(null)} disabled={busy} className="h-10 px-4 rounded-lg border border-[#D0D5DD] bg-white text-sm font-semibold text-[#344054]">
              Cancel
            </button>
            <button type="button" onClick={submitReset} disabled={busy || newPassword.length < 8} className="h-10 px-4 rounded-lg bg-[#142D4E] text-white text-sm font-semibold disabled:opacity-60">
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Remove teacher */}
      <Modal isOpen={!!removeFor} onClose={() => !busy && setRemoveFor(null)} title="Remove this teacher?" maxWidth="md">
        <div className="space-y-4">
          <div className="p-3 bg-[#FEF3F2] border border-[#C0393A]/30 rounded-lg text-xs text-[#7A271A] space-y-1.5">
            <p>
              <strong>{removeFor?.full_name}</strong> ({removeFor?.email}) will no longer be able to sign in.
            </p>
            <p>The {removeFor?.registrations ?? 0} students they registered stay in the system and are no longer assigned to anyone.</p>
          </div>
          {dialogError && <p role="alert" className="text-xs text-[#B42318]">{dialogError}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setRemoveFor(null)} disabled={busy} className="h-10 px-4 rounded-lg border border-[#D0D5DD] bg-white text-sm font-semibold text-[#344054]">
              Cancel
            </button>
            <button type="button" onClick={submitRemove} disabled={busy} className="h-10 px-4 rounded-lg bg-[#C0393A] text-white text-sm font-semibold hover:bg-[#A02E2F] disabled:opacity-60">
              {busy ? 'Removing…' : 'Remove teacher'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
