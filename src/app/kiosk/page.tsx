'use client';
import { useRouter } from 'next/navigation';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  UserCheck,
  Shield,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CameraView } from '@/components/kiosk/CameraView';
import { getOfflineDb, OfflineAttendanceRecord } from '@/lib/db/dexie';
import { cleanDisplayText, validateStudentDetails } from '@/lib/utils/normalization';
import { syncEngine } from '@/lib/sync/syncEngine';
import { AppFooter } from '@/components/common/AppFooter';

type KioskStep =
  | 'CAMERA_FIRST'
  | 'DETAILS_WITH_PHOTO'
  | 'CONFIRM_DETAILS'
  | 'SAVING'
  | 'SUCCESS';

interface AttendeeData {
  id: string | null; // null until a first-time student is registered on submit
  name: string;
  college: string;
  session_id: string;
  session_name: string;
  event_name: string;
}

export default function KioskPage() {
  const router = useRouter();
  const [step, setStep] = useState<KioskStep>('CAMERA_FIRST');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState<string>('');
  const [collegeInput, setCollegeInput] = useState<string>('');
  const [attendee, setAttendee] = useState<AttendeeData | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSavedOffline, setIsSavedOffline] = useState<boolean>(false);
  const [resetCountdown, setResetCountdown] = useState<number>(8);
  const [offlineReady, setOfflineReady] = useState<boolean>(false);
  // Who is signed in on this browser: their registrations appear on their own Live Display
  const [operator, setOperator] = useState<{ name: string; role: string } | null>(null);

  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch('/api/kiosk/operator', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setOperator(d?.operator ?? null))
      .catch(() => setOperator(null));
  }, []);

  // Monitor network and offline readiness (a cached open session is all a kiosk needs)
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
          const session = await db.cached_sessions.where('status').equals('open').first();
          setOfflineReady(!!session);
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

  const handleCancelKiosk = () => {
    handleReset();
    router.push('/');
  };

  const handleReset = () => {
    if (resetTimerRef.current) clearInterval(resetTimerRef.current);
    setStep('CAMERA_FIRST');
    setNameInput('');
    setCollegeInput('');
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

  // STEP 2: Student enters name + college
  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = cleanDisplayText(nameInput);
    const college = cleanDisplayText(collegeInput);

    const invalid = validateStudentDetails(name, college);
    if (invalid) {
      setErrorMessage(invalid);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    // Online: confirm the kiosk is open and the student is not already marked present
    if (navigator.onLine) {
      try {
        const res = await fetch('/api/kiosk/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, college }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          if (data.already_attended) {
            setErrorMessage(`Attendance has already been recorded for ${data.person.name} (${data.person.college}).`);
            setIsLoading(false);
            return;
          }

          setAttendee({
            id: data.person.id,
            name: data.person.name,
            college: data.person.college,
            session_id: data.session.id,
            session_name: data.session.name,
            event_name: data.event.name,
          });
          setStep('CONFIRM_DETAILS');
          setIsLoading(false);
          return;
        } else if (res.status >= 400 && res.status < 500) {
          setErrorMessage(data.error || 'Could not verify your details.');
          setIsLoading(false);
          return;
        }
      } catch (networkErr) {
        console.warn('Online check failed; continuing in offline mode:', networkErr);
      }
    }

    // Offline: use the session saved on this device by /kiosk/ready
    try {
      const db = getOfflineDb();
      const session = await db.cached_sessions.where('status').equals('open').first();
      const event = await db.cached_events.where('status').equals('active').first();

      if (!session) {
        setErrorMessage('This kiosk is offline and has not been prepared for offline use. Please connect to the internet.');
        return;
      }

      setAttendee({
        id: null,
        name,
        college,
        session_id: session.id,
        session_name: session.name,
        event_name: event?.name || 'MIT Mysore Student Attendance',
      });
      setStep('CONFIRM_DETAILS');
    } catch (offlineErr) {
      console.error('Offline preparation lookup error:', offlineErr);
      setErrorMessage('Local storage error. Please try again.');
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
        formData.append('attendee_name', attendee.name);
        formData.append('college', attendee.college);
        formData.append('category', 'student');
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
        person_id: attendee.id || '',
        category: 'student',
        identifier: attendee.college,
        person_name: attendee.name,
        college: attendee.college,
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
      <header className="bg-white border-b border-[#E4E9F0] px-4 sm:px-8 py-3 sm:py-4 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full overflow-hidden bg-white shadow-xs shrink-0 border border-[#E4E9F0] flex items-center justify-center p-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="MRF Logo" className="w-full h-full object-contain rounded-full" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-[#142D4E] tracking-tight leading-snug">
              MIT Mysore Student Attendance Tracker
            </h1>
            <p className="hidden sm:block text-xs text-[#667085]">Self-Service Student Attendance Kiosk</p>
          </div>
        </div>

        {/* Live Status Pills */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {operator && (
            <div
              className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-[#2864B4]/30 bg-[#EAF2FC] text-[#142D4E]"
              title="Students registered on this kiosk appear on this person's Live Display"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#2864B4]" />
              <span>Registering as {operator.name}</span>
            </div>
          )}
          <Link
            href="/kiosk/ready"
            aria-label={offlineReady ? 'Offline ready' : 'Prepare offline'}
            className="text-xs text-[#667085] hover:text-[#142D4E] flex items-center gap-1.5 px-3 py-1 bg-[#F7F9FC] rounded-full border border-[#E4E9F0]"
          >
            <Shield className="w-3.5 h-3.5 text-[#2864B4]" />
            <span className="hidden sm:inline">{offlineReady ? 'Offline Ready' : 'Prep Offline'}</span>
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
                <span className="hidden sm:inline">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-[#B7791F]" />
                <span className="hidden sm:inline">Offline Mode Active</span>
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

                {/* Right Side: Student Details */}
                <div className="md:col-span-7 space-y-4">
                  <form onSubmit={handleDetailsSubmit} className="space-y-3.5 pt-1">
                    <div>
                      <Input
                        label="Student Name"
                        placeholder="Enter your full name"
                        helperText="First time here? You will be registered automatically."
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        maxLength={120}
                        autoComplete="off"
                        required
                      />
                    </div>

                    <div>
                      <Input
                        label="College Name"
                        placeholder="Enter your college name"
                        helperText="Use the same college name every time you check in."
                        value={collegeInput}
                        onChange={(e) => setCollegeInput(e.target.value)}
                        maxLength={160}
                        autoComplete="off"
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
                  Check your photograph and details below before recording your attendance.
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
                    <span className="text-[#667085] font-medium">Student Name:</span>
                    <span className="font-bold text-[#182230] text-sm">{attendee.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                    <span className="text-[#667085] font-medium">College Name:</span>
                    <span className="font-semibold text-[#182230]">{attendee.college}</span>
                  </div>
                  {!attendee.id && (
                    <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                      <span className="text-[#667085] font-medium">Registration:</span>
                      <span className="font-semibold px-2 py-0.5 rounded bg-[#EAF2FC] text-[#2864B4]">
                        New student
                      </span>
                    </div>
                  )}

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
                Saving your photograph and details to the student attendance records...
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
                  ? 'Your attendance and photograph are safely saved on this device and will upload once the internet is back.'
                  : 'Your attendance and photograph have been confirmed and stored in the student attendance records.'}
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
                  <p className="text-[#667085] truncate">{attendee.college}</p>
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
