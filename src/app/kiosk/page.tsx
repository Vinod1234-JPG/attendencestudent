'use client';
import { useRouter } from 'next/navigation';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  UserCheck,
  Shield,
  RotateCcw,
  Camera,
  User,
  Mail,
  Award,
  ChevronDown,
  Search,
  X,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CameraView } from '@/components/kiosk/CameraView';
import { getOfflineDb, OfflineAttendanceRecord } from '@/lib/db/dexie';
import { normalizeEmail, normalizePhdId, maskIdentifier, isNameMatching } from '@/lib/utils/normalization';
import { syncEngine } from '@/lib/sync/syncEngine';
import { AppFooter } from '@/components/common/AppFooter';

type KioskStep =
  | 'CAMERA_FIRST'
  | 'DETAILS_WITH_PHOTO'
  | 'CONFIRM_DETAILS'
  | 'SAVING'
  | 'SUCCESS';

interface AttendeeData {
  id: string;
  name: string;
  category: 'guide' | 'phd_scholar';
  identifier: string;
  masked_identifier: string;
  session_id: string;
  session_name: string;
  event_name: string;
  extra_details?: Record<string, any>;
}

interface RegisteredAttendee {
  id: string;
  name: string;
  category: 'guide' | 'phd_scholar';
  email: string | null;
  phd_id: string | null;
  metadata?: Record<string, any>;
  attended?: boolean;
}

export default function KioskPage() {
  const router = useRouter();
  const [step, setStep] = useState<KioskStep>('CAMERA_FIRST');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);

  const [category, setCategory] = useState<'guide' | 'phd_scholar'>('guide');
  const [nameInput, setNameInput] = useState<string>('');
  const [identifierInput, setIdentifierInput] = useState<string>('');
  const [attendee, setAttendee] = useState<AttendeeData | null>(null);

  // Registered attendees for searchable dropdown
  const [attendeesList, setAttendeesList] = useState<RegisteredAttendee[]>([]);
  const [isLoadingAttendees, setIsLoadingAttendees] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [selectedAttendee, setSelectedAttendee] = useState<RegisteredAttendee | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSavedOffline, setIsSavedOffline] = useState<boolean>(false);
  const [resetCountdown, setResetCountdown] = useState<number>(8);
  const [offlineReady, setOfflineReady] = useState<boolean>(false);

  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch attendees list for dropdown (online with offline fallback)
  const loadAttendees = async () => {
    setIsLoadingAttendees(true);
    try {
      if (typeof window !== 'undefined' && navigator.onLine) {
        const res = await fetch('/api/kiosk/attendees-list');
        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.attendees)) {
          setAttendeesList(data.attendees);

          // Update local IndexedDB cache in background
          try {
            const db = getOfflineDb();
            const toCache = data.attendees.map((a: any) => ({
              id: a.id,
              category: a.category,
              name: a.name,
              normalized_email: a.email,
              phd_id: a.phd_id,
              metadata: a.metadata || {},
            }));
            await db.cached_people.bulkPut(toCache);
          } catch {}

          setIsLoadingAttendees(false);
          return;
        }
      }

      // Offline fallback: load from IndexedDB
      const db = getOfflineDb();
      const cached = await db.cached_people.toArray();
      const mapped: RegisteredAttendee[] = cached.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        email: c.normalized_email || c.metadata?.Email || c.metadata?.email || null,
        phd_id:
          c.phd_id ||
          c.metadata?.['PhD ID'] ||
          c.metadata?.['Ph.D ID'] ||
          c.metadata?.USN ||
          null,
        metadata: c.metadata || {},
        attended: false,
      }));
      setAttendeesList(mapped);
    } catch (e) {
      console.warn('Could not load attendees for dropdown:', e);
    } finally {
      setIsLoadingAttendees(false);
    }
  };

  // Monitor network, offline data readiness, and load initial attendees
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const handleOnline = () => {
        setIsOnline(true);
        loadAttendees();
      };
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      const checkOfflineReadiness = async () => {
        try {
          const db = getOfflineDb();
          const peopleCount = await db.cached_people.count();
          const session = await db.cached_sessions.where('status').equals('open').first();
          setOfflineReady(peopleCount > 0 && !!session);
        } catch {
          setOfflineReady(false);
        }
      };
      checkOfflineReadiness();
      loadAttendees();

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  const handleCancelKiosk = () => {
    handleReset();
    router.push('/');
  };

  const handleReset = () => {
    if (resetTimerRef.current) clearInterval(resetTimerRef.current);
    setStep('CAMERA_FIRST');
    setCategory('guide');
    setNameInput('');
    setIdentifierInput('');
    setSelectedAttendee(null);
    setSearchQuery('');
    setIsDropdownOpen(false);
    setAttendee(null);
    setCapturedBlob(null);
    setCapturedDataUrl(null);
    setIsLoading(false);
    setErrorMessage(null);
    setIsSavedOffline(false);
    setResetCountdown(8);
  };

  // STEP 1: Photo Captured First!
  const handlePhotoCaptured = (blob: Blob, dataUrl: string) => {
    setCapturedBlob(blob);
    setCapturedDataUrl(dataUrl);
    setStep('DETAILS_WITH_PHOTO');
    if (attendeesList.length === 0) {
      loadAttendees();
    }
  };

  // Handle selecting an attendee from the dropdown
  const handleSelectAttendee = (att: RegisteredAttendee) => {
    setSelectedAttendee(att);
    setNameInput(att.name);

    if (att.category === 'guide') {
      const email =
        att.email ||
        att.metadata?.Email ||
        att.metadata?.email ||
        att.metadata?.['Email ID'] ||
        att.metadata?.['Email Address'] ||
        '';
      setIdentifierInput(email);
    } else {
      const identifier =
        att.phd_id ||
        att.metadata?.['PhD ID'] ||
        att.metadata?.['Ph.D ID'] ||
        att.metadata?.USN ||
        att.metadata?.usn ||
        att.email ||
        att.metadata?.Email ||
        '';
      setIdentifierInput(identifier);
    }

    setErrorMessage(null);
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const handleClearSelectedAttendee = () => {
    setSelectedAttendee(null);
    setNameInput('');
    setIdentifierInput('');
    setSearchQuery('');
  };

  // Filter attendees by currently active category and search text
  const categoryAttendees = attendeesList.filter((a) => a.category === category);

  const filteredAttendees = categoryAttendees.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const nameMatch = a.name.toLowerCase().includes(q);
    const emailMatch = a.email ? a.email.toLowerCase().includes(q) : false;
    const phdMatch = a.phd_id ? a.phd_id.toLowerCase().includes(q) : false;
    const deptMatch = a.metadata?.Department
      ? String(a.metadata.Department).toLowerCase().includes(q)
      : false;
    const guideMatch =
      a.metadata?.Guide || a.metadata?.['Guide Name']
        ? String(a.metadata.Guide || a.metadata['Guide Name']).toLowerCase().includes(q)
        : false;
    return nameMatch || emailMatch || phdMatch || deptMatch || guideMatch;
  });

  // STEP 2: Submit Details while photo is clearly visible
  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      setErrorMessage('Please enter your full name or select your profile from the dropdown above.');
      return;
    }
    if (!identifierInput.trim()) {
      setErrorMessage(
        category === 'guide'
          ? 'Please enter your registered email address or select your profile from the dropdown above.'
          : 'Please enter your official PhD ID or email, or select your profile from the dropdown above.'
      );
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const rawInput = identifierInput.trim();
    const normalized = category === 'guide' ? normalizeEmail(rawInput) : normalizePhdId(rawInput);

    // Try online lookup first
    if (navigator.onLine) {
      try {
        const res = await fetch('/api/kiosk/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, identifier: normalized, name: nameInput.trim() }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          if (data.already_attended) {
            setErrorMessage(`Attendance has already been recorded for ${data.person.name}.`);
            setIsLoading(false);
            return;
          }

          setAttendee({
            id: data.person.id,
            name: nameInput.trim() || data.person.name,
            category: data.person.category,
            identifier: data.person.identifier,
            masked_identifier: data.person.masked_identifier,
            session_id: data.session.id,
            session_name: data.session.name,
            event_name: data.event.name,
            extra_details: data.person.extra_details || {},
          });
          setStep('CONFIRM_DETAILS');
          setIsLoading(false);
          return;
        } else if (res.status === 404 || res.status === 400 || res.status === 403) {
          setErrorMessage(data.error || 'Attendee not found.');
          setIsLoading(false);
          return;
        }
      } catch (networkErr) {
        console.warn('Online lookup failed; falling back to offline database:', networkErr);
      }
    }

    // Offline lookup in IndexedDB
    try {
      const db = getOfflineDb();
      let person = null;
      const searchTarget = rawInput.trim().toLowerCase();
      const allCached = await db.cached_people.where('category').equals(category).toArray();

      person = allCached.find((p) => {
        if (category === 'guide') {
          if (p.normalized_email && p.normalized_email.trim().toLowerCase() === searchTarget) return true;
          if (p.metadata) {
            const mEmail = p.metadata.Email || p.metadata.email || p.metadata['Email ID'] || p.metadata['Email Address'];
            if (mEmail && String(mEmail).trim().toLowerCase() === searchTarget) return true;
          }
          return false;
        } else {
          // PhD Scholar: check phd_id, email, or metadata (case-insensitive)
          if (p.phd_id && p.phd_id.trim().toLowerCase() === searchTarget) return true;
          if (p.normalized_email && p.normalized_email.trim().toLowerCase() === searchTarget) return true;
          if (p.metadata) {
            const mEmail = p.metadata.Email || p.metadata.email || p.metadata['Email ID'] || p.metadata['Email Address'];
            if (mEmail && String(mEmail).trim().toLowerCase() === searchTarget) return true;
            const mId = p.metadata.USN || p.metadata.usn || p.metadata['PhD ID'] || p.metadata['Ph.D ID'] || p.metadata.ID || p.metadata['Roll No'];
            if (mId && String(mId).trim().toLowerCase() === searchTarget) return true;
          }
          return false;
        }
      });

      if (!person) {
        // Also check if entered in alternate category offline
        const allPeople = await db.cached_people.toArray();
        const altPerson = allPeople.find((p) => {
          if (p.normalized_email && p.normalized_email.trim().toLowerCase() === searchTarget) return true;
          if (p.phd_id && p.phd_id.trim().toLowerCase() === searchTarget) return true;
          if (p.metadata) {
            const mEmail = p.metadata.Email || p.metadata.email || p.metadata['Email ID'];
            if (mEmail && String(mEmail).trim().toLowerCase() === searchTarget) return true;
          }
          return false;
        });

        if (altPerson && altPerson.category !== category) {
          const catLabel = altPerson.category === 'guide' ? 'Research Guide' : 'PhD Scholar';
          setErrorMessage(`Found "${altPerson.name}" under ${catLabel}. Please select the "${catLabel}" button above.`);
          setIsLoading(false);
          return;
        }

        setErrorMessage(
          category === 'guide'
            ? 'Guide email not found on MRF website. Please select your name from the dropdown or verify your registered email.'
            : 'PhD ID or email not found on MRF website. Please select your name from the dropdown or verify your registered details.'
        );
        setIsLoading(false);
        return;
      }

      if (!isNameMatching(nameInput.trim(), person.name)) {
        setErrorMessage(
          category === 'guide'
            ? `The entered name "${nameInput.trim()}" does not match the registered name for this email address.`
            : `The entered name "${nameInput.trim()}" does not match the registered name for PhD ID ${normalized}.`
        );
        setIsLoading(false);
        return;
      }

      const session = await db.cached_sessions.where('status').equals('open').first();
      const event = await db.cached_events.where('status').equals('active').first();

      setAttendee({
        id: person.id,
        name: nameInput.trim() || person.name,
        category: person.category,
        identifier: normalized,
        masked_identifier: maskIdentifier(normalized, category),
        session_id: session?.id || 'dev-session-1',
        session_name: session?.name || 'General Retreat Check-in Session',
        event_name: event?.name || 'MRF Research Retreat',
      });
      setStep('CONFIRM_DETAILS');
    } catch (offlineErr: any) {
      console.error('Offline lookup error:', offlineErr);
      setErrorMessage('Local lookup failure.');
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 3: Confirm and Persist Attendance
  const handleConfirmAndSubmit = async () => {
    if (!attendee || !capturedBlob || isLoading) return;

    setStep('SAVING');
    setIsLoading(true);

    const operationId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // Direct submission if online
    if (navigator.onLine) {
      try {
        const formData = new FormData();
        formData.append('operation_id', operationId);
        formData.append('session_id', attendee.session_id);
        formData.append('person_id', attendee.id);
        formData.append('attendee_name', attendee.name);
        formData.append('category', attendee.category);
        formData.append('identifier', attendee.identifier);
        formData.append('captured_at_device', nowIso);
        formData.append('photo', capturedBlob, `${operationId}.jpg`);

        const res = await fetch('/api/kiosk/submit', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setIsSavedOffline(false);
          setStep('SUCCESS');
          startAutoResetTimer();
          setIsLoading(false);
          return;
        } else {
          setErrorMessage(data.error || 'Server rejected attendance submission.');
          setStep('CONFIRM_DETAILS');
          setIsLoading(false);
          return;
        }
      } catch (submitErr) {
        console.warn('Network submit failed; storing in offline queue:', submitErr);
      }
    }

    // Save to durable IndexedDB queue
    try {
      const db = getOfflineDb();
      const offlineRecord: OfflineAttendanceRecord = {
        operation_id: operationId,
        session_id: attendee.session_id,
        person_id: attendee.id,
        category: attendee.category,
        identifier: attendee.identifier,
        person_name: attendee.name,
        captured_at_device: nowIso,
        photo_blob: capturedBlob,
        photo_mime_type: 'image/jpeg',
        sync_status: 'pending',
        attempt_count: 0,
        last_attempted_at: null,
        last_error: null,
        created_at: nowIso,
      };

      await db.attendance_queue.put(offlineRecord);
      setIsSavedOffline(true);
      setStep('SUCCESS');
      startAutoResetTimer();
      syncEngine.triggerSync().catch(() => {});
    } catch (dbErr: any) {
      console.error('Failed to store in IndexedDB:', dbErr);
      setErrorMessage('Local storage error.');
      setStep('CONFIRM_DETAILS');
    } finally {
      setIsLoading(false);
    }
  };

  const startAutoResetTimer = () => {
    setResetCountdown(8);
    resetTimerRef.current = setInterval(() => {
      setResetCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(resetTimerRef.current!);
          handleReset();
          return 8;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex flex-col justify-between select-none">
      {/* Top Kiosk Header */}
      <header className="bg-white border-b border-[#E4E9F0] px-8 py-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full overflow-hidden bg-white shadow-xs shrink-0 border border-[#E4E9F0] flex items-center justify-center p-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="MRF Logo" className="w-full h-full object-contain rounded-full" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#142D4E] tracking-tight">
              MAHARAJA RESEARCH FOUNDATION
            </h1>
            <p className="text-xs text-[#667085]">Self-Service Event Attendance Kiosk</p>
          </div>
        </div>

        {/* Live Status Pills */}
        <div className="flex items-center gap-3">
          <Link
            href="/kiosk/ready"
            className="text-xs text-[#667085] hover:text-[#142D4E] flex items-center gap-1.5 px-3 py-1 bg-[#F7F9FC] rounded-full border border-[#E4E9F0]"
          >
            <Shield className="w-3.5 h-3.5 text-[#2864B4]" />
            <span>{offlineReady ? 'Offline Ready' : 'Prep Offline'}</span>
          </Link>

          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
              isOnline
                ? 'bg-[#16835D]/10 text-[#16835D] border-[#16835D]/20'
                : 'bg-[#B7791F]/10 text-[#B7791F] border-[#B7791F]/20'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-[#B7791F]" />
                <span>Offline Mode Active</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Kiosk Content Area */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-6">
        <div className="w-full max-w-4xl bg-white border border-[#E4E9F0] rounded-2xl shadow-sm p-6 md:p-10 transition-all">
          {/* STEP 1: PHOTO CAPTURE FIRST */}
          {step === 'CAMERA_FIRST' && (
            <div className="animate-fadeIn">
              <div className="text-center mb-6">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#EAF2FC] text-[#2864B4] mb-2 uppercase tracking-wider">
                  Step 1 of 2: Attendance Photo
                </span>
                <h2 className="text-2xl md:text-3xl font-extrabold text-[#142D4E] tracking-tight">
                  Welcome! Please Capture Your Photograph
                </h2>
                <p className="text-xs text-[#667085] mt-1 max-w-md mx-auto">
                  Position your face clearly within the frame and click <strong>Capture Photo</strong>. Your photograph will be displayed while entering your details.
                </p>
              </div>

              <CameraView
                onCapture={handlePhotoCaptured}
                onCancel={handleCancelKiosk}
              />
            </div>
          )}

          {/* STEP 2: DETAILS ENTRY WITH CAPTURED PHOTO CLEARLY VISIBLE */}
          {step === 'DETAILS_WITH_PHOTO' && capturedDataUrl && (
            <div className="animate-fadeIn">
              <div className="flex items-center justify-between border-b border-[#E4E9F0] pb-4 mb-6">
                <div>
                  <span className="text-xs font-semibold bg-[#16835D]/10 text-[#16835D] px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Photo Captured
                  </span>
                  <h2 className="text-xl md:text-2xl font-bold text-[#142D4E] mt-1">
                    Step 2: Enter Your Details
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelKiosk}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep('CAMERA_FIRST')}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retake Photo
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                {/* Left Side: Captured Photo Display */}
                <div className="md:col-span-5 flex flex-col items-center bg-[#F7F9FC] border border-[#E4E9F0] p-6 rounded-xl text-center">
                  <span className="text-xs font-semibold text-[#667085] mb-2">
                    Your Captured Attendance Photo:
                  </span>
                  <div className="relative w-48 h-48 rounded-xl overflow-hidden border-4 border-[#142D4E] shadow-md bg-black mb-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={capturedDataUrl}
                      alt="Captured Face"
                      className="w-full h-full object-cover transform scale-x-[-1]"
                    />
                  </div>
                  <span className="text-[11px] text-[#16835D] font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Live Camera Verified
                  </span>
                </div>

                {/* Right Side: Category Selection, Dropdown & Inputs */}
                <div className="md:col-span-7 space-y-4">
                  {/* Category Switcher */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[#182230] block">
                      Select Your Category:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setCategory('guide');
                          setErrorMessage(null);
                          setSelectedAttendee(null);
                          setNameInput('');
                          setIdentifierInput('');
                          setSearchQuery('');
                          setIsDropdownOpen(false);
                        }}
                        className={`p-3 rounded-lg border text-left flex items-center gap-2.5 transition-all ${
                          category === 'guide'
                            ? 'border-[#2864B4] bg-[#EAF2FC] text-[#142D4E] font-bold shadow-xs ring-1 ring-[#2864B4]'
                            : 'border-[#E4E9F0] bg-white text-[#667085] hover:bg-[#F7F9FC]'
                        }`}
                      >
                        <BookOpen className="w-4 h-4 text-[#2864B4]" />
                        <span className="text-xs font-semibold">Guide</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCategory('phd_scholar');
                          setErrorMessage(null);
                          setSelectedAttendee(null);
                          setNameInput('');
                          setIdentifierInput('');
                          setSearchQuery('');
                          setIsDropdownOpen(false);
                        }}
                        className={`p-3 rounded-lg border text-left flex items-center gap-2.5 transition-all ${
                          category === 'phd_scholar'
                            ? 'border-[#2864B4] bg-[#EAF2FC] text-[#142D4E] font-bold shadow-xs ring-1 ring-[#2864B4]'
                            : 'border-[#E4E9F0] bg-white text-[#667085] hover:bg-[#F7F9FC]'
                        }`}
                      >
                        <GraduationCap className="w-4 h-4 text-[#2864B4]" />
                        <span className="text-xs font-semibold">PhD Scholar</span>
                      </button>
                    </div>
                  </div>

                  {/* Searchable Dropdown: Select From Database (Auto-Fill) */}
                  <div className="space-y-1.5" ref={dropdownRef}>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#142D4E] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#2864B4]" />
                        Quick Select from Database (Auto-fill Name &amp; ID):
                      </label>
                      <button
                        type="button"
                        onClick={loadAttendees}
                        disabled={isLoadingAttendees}
                        className="text-[11px] text-[#2864B4] hover:underline flex items-center gap-1"
                        title="Reload attendees from database"
                      >
                        <RefreshCw className={`w-3 h-3 ${isLoadingAttendees ? 'animate-spin' : ''}`} />
                        <span>{isLoadingAttendees ? 'Loading...' : 'Refresh List'}</span>
                      </button>
                    </div>

                    <div className="relative">
                      {/* Dropdown Trigger Box */}
                      {selectedAttendee ? (
                        <div className="p-3 bg-[#EAF7EE] border-2 border-[#16835D] rounded-lg flex items-center justify-between shadow-2xs">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <div className="w-8 h-8 rounded-full bg-[#16835D]/15 text-[#16835D] flex items-center justify-center font-bold text-xs shrink-0">
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <div className="overflow-hidden">
                              <p className="text-xs font-bold text-[#142D4E] truncate">
                                {selectedAttendee.name}
                              </p>
                              <p className="text-[11px] font-mono text-[#16835D] truncate">
                                {category === 'guide'
                                  ? selectedAttendee.email
                                  : `ID: ${selectedAttendee.phd_id || selectedAttendee.email || '—'}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                              className="text-[11px] h-7 px-2 border-[#16835D]/30 text-[#16835D] hover:bg-white"
                            >
                              Change
                            </Button>
                            <button
                              type="button"
                              onClick={handleClearSelectedAttendee}
                              className="p-1 hover:bg-[#16835D]/20 rounded text-[#16835D]"
                              title="Clear selection"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                          className="w-full p-3 bg-white border-2 border-[#CBD5E1] hover:border-[#2864B4] rounded-lg text-left flex items-center justify-between shadow-2xs transition-all focus:outline-none focus:ring-2 focus:ring-[#2864B4]/20"
                        >
                          <div className="flex items-center gap-2 text-xs text-[#667085]">
                            <Search className="w-4 h-4 text-[#2864B4]" />
                            <span>
                              {categoryAttendees.length > 0
                                ? `Click to choose ${category === 'guide' ? 'Guide' : 'PhD Scholar'} from ${categoryAttendees.length} records...`
                                : `No registered ${category === 'guide' ? 'guides' : 'scholars'} in database (Enter manually below)`}
                            </span>
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 text-[#667085] transition-transform ${
                              isDropdownOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      )}

                      {/* Dropdown Menu Popover */}
                      {isDropdownOpen && (
                        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border-2 border-[#2864B4] rounded-xl shadow-xl overflow-hidden animate-fadeIn">
                          {/* Search Input Inside Dropdown */}
                          <div className="p-2.5 bg-[#F7F9FC] border-b border-[#E4E9F0] flex items-center gap-2">
                            <Search className="w-4 h-4 text-[#667085] shrink-0" />
                            <input
                              type="text"
                              autoFocus
                              placeholder={`Type name, email, or PhD ID to search...`}
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="w-full bg-transparent text-xs text-[#182230] placeholder-[#94A3B8] focus:outline-none"
                            />
                            {searchQuery && (
                              <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="p-1 hover:bg-[#E4E9F0] rounded text-[#667085]"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* List count summary */}
                          <div className="px-3 py-1.5 bg-[#EAF2FC]/50 text-[11px] text-[#2864B4] font-medium border-b border-[#E4E9F0] flex items-center justify-between">
                            <span>
                              Showing {filteredAttendees.length} of {categoryAttendees.length} registered {category === 'guide' ? 'Guides' : 'PhD Scholars'}
                            </span>
                            {searchQuery && (
                              <span className="text-[10px] text-[#667085]">Filtered by &ldquo;{searchQuery}&rdquo;</span>
                            )}
                          </div>

                          {/* Attendees List */}
                          <div className="max-h-60 overflow-y-auto divide-y divide-[#E4E9F0]">
                            {filteredAttendees.length === 0 ? (
                              <div className="p-4 text-center text-xs text-[#667085]">
                                <p className="font-semibold text-[#142D4E]">No matches found.</p>
                                <p className="mt-1 text-[11px]">
                                  {categoryAttendees.length === 0
                                    ? 'No attendees are loaded in this category yet. You can type your name and email/PhD ID manually below.'
                                    : 'No attendee matches your search filter. You can type your details manually below.'}
                                </p>
                              </div>
                            ) : (
                              filteredAttendees.map((att) => {
                                const isSelected = selectedAttendee?.id === att.id;
                                const dept =
                                  att.metadata?.Department ||
                                  att.metadata?.department ||
                                  att.metadata?.Affiliation ||
                                  att.metadata?.College;
                                const guide =
                                  att.metadata?.Guide ||
                                  att.metadata?.['Guide Name'] ||
                                  att.metadata?.guide;

                                return (
                                  <button
                                    type="button"
                                    key={att.id}
                                    onClick={() => handleSelectAttendee(att)}
                                    className={`w-full p-2.5 text-left flex items-center justify-between gap-2 hover:bg-[#F0F5FC] transition-colors ${
                                      isSelected ? 'bg-[#EAF2FC]' : ''
                                    }`}
                                  >
                                    <div className="min-w-0 flex items-center gap-2.5">
                                      <div className="w-7 h-7 rounded-full bg-[#142D4E] text-white flex items-center justify-center font-bold text-xs shrink-0">
                                        {att.name.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-[#142D4E] truncate">
                                          {att.name}
                                        </p>
                                        <div className="flex items-center gap-2 text-[11px] text-[#667085] truncate">
                                          {att.category === 'guide' ? (
                                            <span className="font-mono text-[#2864B4]">{att.email || '—'}</span>
                                          ) : (
                                            <>
                                              {att.phd_id && (
                                                <span className="font-mono font-semibold text-[#2864B4]">
                                                  ID: {att.phd_id}
                                                </span>
                                              )}
                                              {att.email && (
                                                <span className="font-mono truncate">{att.email}</span>
                                              )}
                                            </>
                                          )}
                                        </div>
                                        {(dept || guide) && (
                                          <p className="text-[10px] text-[#94A3B8] truncate">
                                            {dept ? `Dept: ${dept}` : ''}
                                            {dept && guide ? ' • ' : ''}
                                            {guide ? `Guide: ${guide}` : ''}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="shrink-0 flex items-center gap-1.5">
                                      {att.attended ? (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#B7791F]/15 text-[#B7791F]">
                                          Attended
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EAF2FC] text-[#2864B4]">
                                          Auto-fill
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Form Inputs (Auto-filled or Manual Entry) */}
                  <form onSubmit={handleDetailsSubmit} className="space-y-3.5 pt-1">
                    <div>
                      <Input
                        label="Full Name (as per MRF Website) *"
                        placeholder="Enter full name as registered on MRF website"
                        helperText={
                          selectedAttendee
                            ? '✓ Auto-filled from MRF database. You can edit if needed.'
                            : 'Enter full name, or choose from the dropdown above.'
                        }
                        value={nameInput}
                        onChange={(e) => {
                          setNameInput(e.target.value);
                          if (selectedAttendee && e.target.value !== selectedAttendee.name) {
                            setSelectedAttendee(null);
                          }
                        }}
                        required
                      />
                    </div>

                    <div>
                      <Input
                        label={
                          category === 'guide'
                            ? 'Registered Email Address (MRF Email) *'
                            : 'Registered Email Address / PhD ID (as per MRF Website) *'
                        }
                        placeholder={
                          category === 'guide'
                            ? 'Enter registered MRF email address'
                            : 'Enter registered MRF email address or PhD ID (e.g. 17)'
                        }
                        helperText={
                          selectedAttendee
                            ? '✓ Auto-filled from MRF database. You can edit if needed.'
                            : category === 'guide'
                            ? 'Please enter your registered MRF email address.'
                            : 'Please enter your registered MRF email address or official PhD ID.'
                        }
                        type={category === 'guide' ? 'email' : 'text'}
                        value={identifierInput}
                        onChange={(e) => {
                          setIdentifierInput(e.target.value);
                          if (selectedAttendee) {
                            setSelectedAttendee(null);
                          }
                        }}
                        required
                      />
                    </div>

                    {errorMessage && (
                      <div className="p-3 bg-[#C0393A]/10 border border-[#C0393A]/20 rounded-md flex items-center gap-2 text-xs font-medium text-[#C0393A]">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    <div className="pt-2">
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        className="w-full shadow-sm bg-[#142D4E] hover:bg-[#1E4D8C] text-white py-3.5 text-sm font-bold"
                        isLoading={isLoading}
                      >
                        Proceed to Confirm <ArrowRight className="w-4 h-4 ml-1.5" />
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CONFIRM DETAILS WITH PHOTO */}
          {step === 'CONFIRM_DETAILS' && attendee && capturedDataUrl && (
            <div className="animate-fadeIn">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-[#EAF2FC] text-[#2864B4] rounded-full flex items-center justify-center mx-auto mb-2">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-[#142D4E]">
                  Please Confirm Your Attendance
                </h2>
                <p className="text-xs text-[#667085] mt-1">
                  Verify your photograph and registered details below before final recording.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-[#F7F9FC] border border-[#E4E9F0] rounded-xl p-6 mb-6 items-center">
                {/* Photo in Confirmation Card */}
                <div className="md:col-span-4 flex flex-col items-center">
                  <div className="relative w-40 h-40 rounded-xl overflow-hidden border-2 border-[#142D4E] shadow-sm bg-black mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={capturedDataUrl}
                      alt="Verified Attendance Capture"
                      className="w-full h-full object-cover transform scale-x-[-1]"
                    />
                  </div>
                  <span className="text-[10px] text-[#667085] font-mono">
                    Verified Frame
                  </span>
                </div>

                {/* Details in Confirmation Card */}
                <div className="md:col-span-8 space-y-2.5 text-xs">
                  <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                    <span className="text-[#667085] font-medium">Attendee Name:</span>
                    <span className="font-bold text-[#182230] text-sm">{attendee.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                    <span className="text-[#667085] font-medium">Category:</span>
                    <span className="font-semibold px-2 py-0.5 rounded bg-[#EAF2FC] text-[#2864B4] capitalize">
                      {attendee.category === 'guide' ? 'Guide' : 'PhD Scholar'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                    <span className="text-[#667085] font-medium">
                      {attendee.category === 'guide' ? 'Registered Email Address:' : 'PhD ID / Email Address:'}
                    </span>
                    <span className="font-mono font-semibold text-[#182230]">
                      {attendee.identifier}
                    </span>
                  </div>

                  {/* Render Extra Columns if available (e.g. Commerce, Department, Guide) */}
                  {attendee.extra_details &&
                    Object.entries(attendee.extra_details).map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-[#E4E9F0] pb-2">
                        <span className="text-[#667085] font-medium">{k}:</span>
                        <span className="font-semibold text-[#182230]">{String(v)}</span>
                      </div>
                    ))}

                  <div className="flex justify-between pt-1">
                    <span className="text-[#667085] font-medium">Session:</span>
                    <span className="text-[#142D4E] font-semibold">{attendee.session_name}</span>
                  </div>
                </div>
              </div>

              {errorMessage && (
                <div className="mb-6 p-3 bg-[#C0393A]/10 border border-[#C0393A]/20 rounded-md flex items-center gap-2 text-xs font-medium text-[#C0393A]">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleCancelKiosk}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-1/3"
                  onClick={() => setStep('DETAILS_WITH_PHOTO')}
                >
                  Edit Details
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1 shadow-md bg-[#142D4E] hover:bg-[#1E4D8C] text-white font-bold"
                  onClick={handleConfirmAndSubmit}
                  isLoading={isLoading}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Confirm and Record Attendance
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: SAVING */}
          {step === 'SAVING' && (
            <div className="text-center py-12 animate-fadeIn">
              <RefreshCw className="w-12 h-12 text-[#2864B4] animate-spin mx-auto mb-4" />
              <h3 className="text-xl font-bold text-[#142D4E]">
                {isOnline ? 'Recording Your Attendance...' : 'Saving Attendance on This Device...'}
              </h3>
              <p className="text-xs text-[#667085] mt-2">
                Persisting your photograph and attendee details into Maharaja Research Foundation records...
              </p>
            </div>
          )}

          {/* STEP 5: SUCCESS WITH VISIBLE PHOTOGRAPH */}
          {step === 'SUCCESS' && attendee && capturedDataUrl && (
            <div className="text-center animate-fadeIn py-4">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${
                  isSavedOffline
                    ? 'bg-[#B7791F]/10 text-[#B7791F]'
                    : 'bg-[#16835D]/10 text-[#16835D]'
                }`}
              >
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <h2 className="text-2xl md:text-3xl font-extrabold text-[#142D4E]">
                {isSavedOffline
                  ? 'Attendance Saved on This Device'
                  : 'Attendance Recorded Successfully'}
              </h2>

              <p className="text-xs text-[#667085] mt-1 max-w-md mx-auto">
                {isSavedOffline
                  ? 'Your attendance and photograph are safely cached on this terminal and will sync to Supabase once connected.'
                  : 'Your attendance and photograph have been confirmed and stored in MRF attendance records.'}
              </p>

              {/* Verified Card with Photo */}
              <div className="bg-[#F7F9FC] border border-[#E4E9F0] rounded-xl p-5 my-6 max-w-md mx-auto flex items-center gap-4 text-left">
                <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-[#16835D] shadow-xs bg-black shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={capturedDataUrl}
                    alt={attendee.name}
                    className="w-full h-full object-cover transform scale-x-[-1]"
                  />
                </div>
                <div className="space-y-1 text-xs overflow-hidden">
                  <p className="font-bold text-sm text-[#182230] truncate">{attendee.name}</p>
                  <p className="text-[#667085] capitalize">
                    {attendee.category === 'guide' ? 'Guide' : 'PhD Scholar'}
                  </p>
                  <p className="text-[11px] font-mono text-[#16835D] font-semibold">
                    ✓ Verified at {new Date().toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {/* Auto-Reset Action */}
              <div className="space-y-3">
                <Button
                  variant="primary"
                  size="xl"
                  onClick={handleReset}
                  className="w-full max-w-xs shadow-md bg-[#142D4E] hover:bg-[#1E4D8C] text-white font-bold"
                >
                  Start Next Attendance
                </Button>

                <p className="text-xs text-[#667085]">
                  Kiosk will reset automatically in{' '}
                  <span className="font-bold text-[#142D4E]">{resetCountdown}</span> seconds.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Constant Universal Footer */}
      <AppFooter />
    </div>
  );
}
