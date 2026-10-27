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
  RotateCcw,
  Camera,
  User,
  Mail,
  Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CameraView } from '@/components/kiosk/CameraView';
import { getOfflineDb, OfflineAttendanceRecord } from '@/lib/db/dexie';
import { normalizeEmail, normalizePhdId, maskIdentifier } from '@/lib/utils/normalization';
import { syncEngine } from '@/lib/sync/syncEngine';

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

export default function KioskPage() {
  const [step, setStep] = useState<KioskStep>('CAMERA_FIRST');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);

  const [category, setCategory] = useState<'guide' | 'phd_scholar'>('guide');
  const [nameInput, setNameInput] = useState<string>('');
  const [identifierInput, setIdentifierInput] = useState<string>('');
  const [attendee, setAttendee] = useState<AttendeeData | null>(null);

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

  const handleReset = () => {
    if (resetTimerRef.current) clearInterval(resetTimerRef.current);
    setStep('CAMERA_FIRST');
    setCategory('guide');
    setNameInput('');
    setIdentifierInput('');
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
  };

  // STEP 2: Submit Details while photo is clearly visible
  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifierInput.trim()) return;

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
        // Fallback for self-check-in if name is provided
        if (nameInput.trim()) {
          person = {
            id: `offline-${Date.now()}`,
            name: nameInput.trim(),
            category,
            normalized_email: category === 'guide' ? normalized : null,
            phd_id: category === 'phd_scholar' ? normalized : null,
          };
        } else {
          setErrorMessage(
            category === 'guide'
              ? 'Guide email not found. Please enter your name and registered email.'
              : 'PhD ID not found. Please verify your official MRF PhD ID.'
          );
          setIsLoading(false);
          return;
        }
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
        session_name: session?.name || 'General Conclave Check-in Session',
        event_name: event?.name || 'MRF Annual Research Conclave 2026',
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
    if (!attendee || !capturedBlob) return;

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
                onCancel={handleReset}
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep('CAMERA_FIRST')}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retake Photo
                </Button>
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

                {/* Right Side: Category Selection & Inputs */}
                <div className="md:col-span-7 space-y-5">
                  {/* Category Switcher */}
                  <div>
                    <label className="text-xs font-bold text-[#182230] block mb-2">
                      Select Your Category:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setCategory('guide');
                          setErrorMessage(null);
                        }}
                        className={`p-3 rounded-lg border text-left flex items-center gap-2.5 transition-all ${
                          category === 'guide'
                            ? 'border-[#2864B4] bg-[#EAF2FC] text-[#142D4E] font-bold shadow-xs'
                            : 'border-[#E4E9F0] bg-white text-[#667085] hover:bg-[#F7F9FC]'
                        }`}
                      >
                        <BookOpen className="w-4 h-4 text-[#2864B4]" />
                        <span className="text-xs">Guide</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCategory('phd_scholar');
                          setErrorMessage(null);
                        }}
                        className={`p-3 rounded-lg border text-left flex items-center gap-2.5 transition-all ${
                          category === 'phd_scholar'
                            ? 'border-[#2864B4] bg-[#EAF2FC] text-[#142D4E] font-bold shadow-xs'
                            : 'border-[#E4E9F0] bg-white text-[#667085] hover:bg-[#F7F9FC]'
                        }`}
                      >
                        <GraduationCap className="w-4 h-4 text-[#2864B4]" />
                        <span className="text-xs">PhD Scholar</span>
                      </button>
                    </div>
                  </div>

                  {/* Form Inputs */}
                  <form onSubmit={handleDetailsSubmit} className="space-y-4">
                    <Input
                      label="Full Name"
                      placeholder="e.g. Dr. Anand Sharma or Deepika Sharma"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      required
                    />

                    <Input
                      label={
                        category === 'guide'
                          ? 'Registered Email Address'
                          : 'Official MRF PhD ID'
                      }
                      placeholder={
                        category === 'guide'
                          ? 'e.g. prof.name@university.edu'
                          : 'e.g. MRF-PHD-2026-001'
                      }
                      type={category === 'guide' ? 'email' : 'text'}
                      value={identifierInput}
                      onChange={(e) => setIdentifierInput(e.target.value)}
                      required
                    />

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
                        className="w-full shadow-sm"
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
                    <span className="text-[#667085] font-medium">Identifier:</span>
                    <span className="font-mono font-semibold text-[#182230]">
                      {attendee.category === 'guide' ? attendee.identifier : `ID: ${attendee.identifier}`}
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
                  className="w-1/3"
                  onClick={() => setStep('DETAILS_WITH_PHOTO')}
                >
                  Edit Details
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1 shadow-md"
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
                  className="w-full max-w-xs shadow-md"
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

