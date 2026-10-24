'use client';

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
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CameraView } from '@/components/kiosk/CameraView';
import { getOfflineDb, OfflineAttendanceRecord } from '@/lib/db/dexie';
import { normalizeEmail, normalizePhdId, maskIdentifier } from '@/lib/utils/normalization';
import { syncEngine } from '@/lib/sync/syncEngine';

type KioskStep =
  | 'CATEGORY'
  | 'IDENTIFIER'
  | 'CONFIRM_DETAILS'
  | 'CAMERA_CAPTURE'
  | 'PHOTO_PREVIEW'
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
}

export default function KioskPage() {
  const [step, setStep] = useState<KioskStep>('CATEGORY');
  const [category, setCategory] = useState<'guide' | 'phd_scholar' | null>(null);
  const [identifierInput, setIdentifierInput] = useState<string>('');
  const [attendee, setAttendee] = useState<AttendeeData | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSavedOffline, setIsSavedOffline] = useState<boolean>(false);
  const [resetCountdown, setResetCountdown] = useState<number>(8);
  const [offlineReady, setOfflineReady] = useState<boolean>(false);

  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Monitor network and offline data readiness
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Check Dexie cache readiness
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

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  // Reset helper
  const handleReset = () => {
    if (resetTimerRef.current) clearInterval(resetTimerRef.current);
    setStep('CATEGORY');
    setCategory(null);
    setIdentifierInput('');
    setAttendee(null);
    setCapturedBlob(null);
    setCapturedDataUrl(null);
    setIsLoading(false);
    setErrorMessage(null);
    setIsSavedOffline(false);
    setResetCountdown(8);
  };

  // Step 1: Category Selected
  const handleCategorySelect = (selected: 'guide' | 'phd_scholar') => {
    setCategory(selected);
    setIdentifierInput('');
    setErrorMessage(null);
    setStep('IDENTIFIER');
  };

  // Step 2: Identifier Lookup (Online with fallback to Dexie Offline Cache)
  const handleIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !identifierInput.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    const rawInput = identifierInput.trim();
    const normalized = category === 'guide' ? normalizeEmail(rawInput) : normalizePhdId(rawInput);

    // Try online lookup first if browser reports online
    if (navigator.onLine) {
      try {
        const res = await fetch('/api/kiosk/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, identifier: normalized }),
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
            name: data.person.name,
            category: data.person.category,
            identifier: data.person.identifier,
            masked_identifier: data.person.masked_identifier,
            session_id: data.session.id,
            session_name: data.session.name,
            event_name: data.event.name,
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

      if (category === 'guide') {
        person = await db.cached_people
          .where('normalized_email')
          .equals(normalized)
          .first();
      } else {
        person = await db.cached_people
          .where('phd_id')
          .equals(normalized)
          .first();
      }

      if (!person) {
        setErrorMessage(
          category === 'guide'
            ? 'Guide email not found in local cached records. Please verify spelling or contact registration.'
            : 'Official PhD ID not found in local cached records. Please check your ID.'
        );
        setIsLoading(false);
        return;
      }

      // Check if already in offline attendance queue
      const existingQueueItem = await db.attendance_queue
        .where('person_id')
        .equals(person.id)
        .first();

      if (existingQueueItem) {
        setErrorMessage(`Attendance has already been recorded locally for ${person.name}.`);
        setIsLoading(false);
        return;
      }

      const session = await db.cached_sessions.where('status').equals('open').first();
      const event = await db.cached_events.where('status').equals('active').first();

      setAttendee({
        id: person.id,
        name: person.name,
        category: person.category,
        identifier: normalized,
        masked_identifier: maskIdentifier(normalized, category),
        session_id: session?.id || 'offline-session-id',
        session_name: session?.name || 'MRF Conclave Session',
        event_name: event?.name || 'Maharaja Research Foundation Event',
      });
      setStep('CONFIRM_DETAILS');
    } catch (offlineErr: any) {
      console.error('Offline lookup error:', offlineErr);
      setErrorMessage('Local lookup failure. Please contact administrator.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4: Photo Captured
  const handlePhotoCaptured = (blob: Blob, dataUrl: string) => {
    setCapturedBlob(blob);
    setCapturedDataUrl(dataUrl);
    setStep('PHOTO_PREVIEW');
  };

  // Step 5: Final Submission (Online or durable Offline queue)
  const handleConfirmAndSubmit = async () => {
    if (!attendee || !capturedBlob) return;

    setStep('SAVING');
    setIsLoading(true);

    const operationId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // If online, attempt direct server submission
    if (navigator.onLine) {
      try {
        const formData = new FormData();
        formData.append('operation_id', operationId);
        formData.append('session_id', attendee.session_id);
        formData.append('person_id', attendee.id);
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
        } else if (res.status === 409) {
          setErrorMessage(data.error || 'Attendance has already been recorded for this attendee.');
          setStep('CONFIRM_DETAILS');
          setIsLoading(false);
          return;
        } else {
          console.warn('Server submission failed; falling back to durable offline queue:', data.error);
        }
      } catch (submitErr) {
        console.warn('Network interrupted during submit; storing in offline queue:', submitErr);
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

      // Attempt background sync in case connection just returned
      syncEngine.triggerSync().catch(() => {});
    } catch (dbErr: any) {
      console.error('Failed to store offline record in IndexedDB:', dbErr);
      setErrorMessage('Local storage error. Attendance could not be saved.');
      setStep('PHOTO_PREVIEW');
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
          <div className="w-10 h-10 rounded-lg bg-[#142D4E] flex items-center justify-center text-white font-bold">
            <GraduationCap className="w-6 h-6 text-[#EAF2FC]" />
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
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl bg-white border border-[#E4E9F0] rounded-2xl shadow-sm p-8 md:p-12 transition-all">
          {/* STEP 1: CATEGORY SELECTION */}
          {step === 'CATEGORY' && (
            <div className="text-center animate-fadeIn">
              <h2 className="text-2xl md:text-3xl font-extrabold text-[#142D4E] tracking-tight">
                Welcome to MRF Event Attendance
              </h2>
              <p className="text-[#667085] mt-2 mb-8 text-base">
                Please select your attendee category to record your attendance.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Guide Option */}
                <button
                  onClick={() => handleCategorySelect('guide')}
                  className="group flex flex-col items-center text-center p-8 rounded-xl border-2 border-[#E4E9F0] bg-white hover:border-[#2864B4] hover:bg-[#EAF2FC]/30 transition-all shadow-sm hover:shadow"
                >
                  <div className="w-16 h-16 rounded-2xl bg-[#EAF2FC] text-[#2864B4] flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-[#142D4E]">Guide</h3>
                  <p className="text-xs text-[#667085] mt-2">
                    Check in using your registered email address.
                  </p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-[#2864B4] group-hover:underline">
                    Proceed as Guide <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>

                {/* PhD Scholar Option */}
                <button
                  onClick={() => handleCategorySelect('phd_scholar')}
                  className="group flex flex-col items-center text-center p-8 rounded-xl border-2 border-[#E4E9F0] bg-white hover:border-[#2864B4] hover:bg-[#EAF2FC]/30 transition-all shadow-sm hover:shadow"
                >
                  <div className="w-16 h-16 rounded-2xl bg-[#EAF2FC] text-[#2864B4] flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                    <GraduationCap className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-[#142D4E]">PhD Scholar</h3>
                  <p className="text-xs text-[#667085] mt-2">
                    Check in using your official MRF-issued PhD ID.
                  </p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-[#2864B4] group-hover:underline">
                    Proceed as Scholar <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: IDENTIFIER ENTRY */}
          {step === 'IDENTIFIER' && (
            <div className="animate-fadeIn">
              <button
                onClick={() => setStep('CATEGORY')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#667085] hover:text-[#142D4E] mb-6"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Category Selection
              </button>

              <div className="text-center mb-8">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#EAF2FC] text-[#2864B4] mb-2 uppercase tracking-wider">
                  {category === 'guide' ? 'Guide Check-In' : 'PhD Scholar Check-In'}
                </span>
                <h2 className="text-2xl font-bold text-[#142D4E]">
                  {category === 'guide'
                    ? 'Enter Registered Email Address'
                    : 'Enter Official MRF PhD ID'}
                </h2>
                <p className="text-sm text-[#667085] mt-1">
                  {category === 'guide'
                    ? 'Please provide the exact email address used during your registration.'
                    : 'Please enter your MRF-assigned PhD ID (e.g. MRF-PHD-2026-001).'}
                </p>
              </div>

              <form onSubmit={handleIdentifierSubmit} className="space-y-6">
                <div>
                  <Input
                    label={category === 'guide' ? 'Registered Email Address' : 'Official MRF PhD ID'}
                    placeholder={
                      category === 'guide'
                        ? 'e.g. prof.name@university.edu'
                        : 'e.g. MRF-PHD-0042'
                    }
                    type={category === 'guide' ? 'email' : 'text'}
                    value={identifierInput}
                    onChange={(e) => setIdentifierInput(e.target.value)}
                    required
                    autoFocus
                    className="text-lg py-3"
                  />
                  {errorMessage && (
                    <div className="mt-3 p-3 bg-[#C0393A]/10 border border-[#C0393A]/20 rounded-md flex items-center gap-2 text-xs font-medium text-[#C0393A]">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-1/3"
                    onClick={() => setStep('CATEGORY')}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="flex-1"
                    isLoading={isLoading}
                  >
                    Continue <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 3: CONFIRM DETAILS */}
          {step === 'CONFIRM_DETAILS' && attendee && (
            <div className="animate-fadeIn">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-[#EAF2FC] text-[#2864B4] rounded-full flex items-center justify-center mx-auto mb-3">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-[#142D4E]">Please Confirm Your Details</h2>
                <p className="text-xs text-[#667085] mt-1">
                  Ensure the registered information below matches your identity before proceeding.
                </p>
              </div>

              <div className="bg-[#F7F9FC] border border-[#E4E9F0] rounded-xl p-6 space-y-4 mb-6">
                <div className="flex justify-between items-center border-b border-[#E4E9F0] pb-3">
                  <span className="text-xs text-[#667085] font-medium">Full Name</span>
                  <span className="text-base font-bold text-[#182230]">{attendee.name}</span>
                </div>
                <div className="flex justify-between items-center border-b border-[#E4E9F0] pb-3">
                  <span className="text-xs text-[#667085] font-medium">Attendee Category</span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#EAF2FC] text-[#2864B4]">
                    {attendee.category === 'guide' ? 'Guide' : 'PhD Scholar'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-[#E4E9F0] pb-3">
                  <span className="text-xs text-[#667085] font-medium">Identifier</span>
                  <span className="text-sm font-semibold font-mono text-[#182230]">
                    {attendee.masked_identifier}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#667085] font-medium">Session</span>
                  <span className="text-xs text-[#142D4E] font-medium">{attendee.session_name}</span>
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
                  className="w-1/2"
                  onClick={() => setStep('IDENTIFIER')}
                >
                  No, Go Back
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-1/2"
                  onClick={() => setStep('CAMERA_CAPTURE')}
                >
                  Yes, Continue <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: CAMERA CAPTURE */}
          {step === 'CAMERA_CAPTURE' && (
            <CameraView
              onCapture={handlePhotoCaptured}
              onCancel={() => setStep('CONFIRM_DETAILS')}
            />
          )}

          {/* STEP 5: PHOTO PREVIEW */}
          {step === 'PHOTO_PREVIEW' && capturedDataUrl && (
            <div className="animate-fadeIn text-center">
              <h2 className="text-2xl font-bold text-[#142D4E] mb-2">Preview Your Photograph</h2>
              <p className="text-xs text-[#667085] mb-6">
                Please inspect your captured photograph. You can retake if blurry or misaligned.
              </p>

              <div className="relative w-64 h-64 mx-auto rounded-xl overflow-hidden border-4 border-[#142D4E] shadow-lg mb-6 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={capturedDataUrl}
                  alt="Attendance Preview"
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
              </div>

              {errorMessage && (
                <div className="mb-6 p-3 bg-[#C0393A]/10 border border-[#C0393A]/20 rounded-md flex items-center gap-2 text-xs font-medium text-[#C0393A]">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setStep('CAMERA_CAPTURE')}
                  disabled={isLoading}
                >
                  <RotateCcw className="w-4 h-4 mr-1.5" /> Retake Photo
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleConfirmAndSubmit}
                  isLoading={isLoading}
                  className="px-8 shadow-md"
                >
                  <CheckCircle2 className="w-5 h-5 mr-1.5" /> Confirm & Submit Attendance
                </Button>
              </div>
            </div>
          )}

          {/* STEP 6: SAVING STATE */}
          {step === 'SAVING' && (
            <div className="text-center py-12 animate-fadeIn">
              <RefreshCw className="w-12 h-12 text-[#2864B4] animate-spin mx-auto mb-4" />
              <h3 className="text-xl font-bold text-[#142D4E]">
                {isOnline ? 'Recording Your Attendance...' : 'Saving Attendance on This Device...'}
              </h3>
              <p className="text-xs text-[#667085] mt-2">
                {isOnline
                  ? 'Transmitting photograph and attendance record to Supabase...'
                  : 'Securing photograph and attendance details locally in IndexedDB...'}
              </p>
            </div>
          )}

          {/* STEP 7: SUCCESS (ONLINE OR OFFLINE) */}
          {step === 'SUCCESS' && attendee && (
            <div className="text-center animate-fadeIn py-4">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  isSavedOffline
                    ? 'bg-[#B7791F]/10 text-[#B7791F]'
                    : 'bg-[#16835D]/10 text-[#16835D]'
                }`}
              >
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <h2 className="text-2xl md:text-3xl font-extrabold text-[#142D4E]">
                {isSavedOffline
                  ? 'Attendance Saved on This Device'
                  : 'Attendance Recorded Successfully'}
              </h2>

              <p className="text-sm text-[#667085] mt-2 max-w-md mx-auto">
                {isSavedOffline
                  ? 'Your attendance has been safely saved locally. It will automatically synchronize with the server when connectivity returns.'
                  : 'Your photograph and attendance have been confirmed and stored on the Maharaja Research Foundation server.'}
              </p>

              {/* Summary Card */}
              <div className="bg-[#F7F9FC] border border-[#E4E9F0] rounded-xl p-5 my-6 max-w-md mx-auto text-left space-y-2.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[#667085]">Attendee:</span>
                  <span className="font-bold text-[#182230]">{attendee.name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#667085]">Category:</span>
                  <span className="font-semibold text-[#142D4E] capitalize">
                    {attendee.category === 'guide' ? 'Guide' : 'PhD Scholar'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#667085]">Status:</span>
                  <span
                    className={`font-semibold ${
                      isSavedOffline ? 'text-[#B7791F]' : 'text-[#16835D]'
                    }`}
                  >
                    {isSavedOffline ? 'Waiting to Sync' : 'Server Confirmed'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#667085]">Timestamp:</span>
                  <span className="font-mono text-[#182230]">
                    {new Date().toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* Action & Auto-Reset Timer */}
              <div className="space-y-4">
                <Button
                  variant="primary"
                  size="xl"
                  onClick={handleReset}
                  className="w-full max-w-xs shadow-md"
                >
                  Start Next Attendance
                </Button>

                <p className="text-xs text-[#667085]">
                  Kiosk will reset automatically in <span className="font-bold text-[#142D4E]">{resetCountdown}</span> seconds.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Kiosk Footer with Privacy Notice */}
      <footer className="bg-white border-t border-[#E4E9F0] px-8 py-3 text-center text-xs text-[#667085]">
        <p>
          Photographs captured are strictly used for Maharaja Research Foundation event attendance
          verification. All data is private and securely encrypted.
        </p>
      </footer>
    </div>
  );
}
