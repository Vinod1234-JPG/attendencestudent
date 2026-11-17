'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Calendar,
  Clock,
  Save,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Shield,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function EventSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form fields
  const [eventId, setEventId] = useState('');
  const [eventName, setEventName] = useState('MIT Mysore Student Attendance');
  const [eventDate, setEventDate] = useState('2026-10-24');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [kioskEnabled, setKioskEnabled] = useState(true);
  const [offlineAllowed, setOfflineAllowed] = useState(true);
  const [photoRetentionDays, setPhotoRetentionDays] = useState(365);

  const [sessionId, setSessionId] = useState('');
  const [sessionName, setSessionName] = useState('General Check-in Session');
  const [sessionStatus, setSessionStatus] = useState<'open' | 'closed'>('open');

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/event');
      const data = await res.json();

      if (res.ok && data.success) {
        if (data.event) {
          setEventId(data.event.id);
          setEventName(data.event.name || '');
          setEventDate(data.event.event_date || '');
          setTimezone(data.event.timezone || 'Asia/Kolkata');
          setKioskEnabled(data.event.kiosk_enabled ?? true);
          setOfflineAllowed(data.event.offline_allowed ?? true);
          setPhotoRetentionDays(data.event.photo_retention_days || 365);
        }
        if (data.session) {
          setSessionId(data.session.id);
          setSessionName(data.session.name || '');
          setSessionStatus(data.session.status || 'open');
        }
      }
    } catch (e: any) {
      setErrorMessage('Failed to load current settings.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          eventName,
          eventDate,
          timezone,
          kioskEnabled,
          offlineAllowed,
          photoRetentionDays,
          sessionId,
          sessionName,
          sessionStatus,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update event settings.');
      }

      setStatusMessage('Event and attendance session settings updated successfully.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142D4E]">Event & Session Settings</h1>
          <p className="text-xs text-[#667085] mt-1">
            Configure the single active event, attendance session status, and security retention.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSettings} isLoading={isLoading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reload
        </Button>
      </div>

      {statusMessage && (
        <div className="p-4 bg-[#16835D]/10 border border-[#16835D]/20 text-[#16835D] rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-[#C0393A]/10 border border-[#C0393A]/20 text-[#C0393A] rounded-lg text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Event Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#2864B4]" /> Event Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Event Name"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              required
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Event Date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
              />
              <Input
                label="Timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                required
                helperText="e.g. Asia/Kolkata (IST)"
              />
            </div>
          </CardContent>
        </Card>

        {/* Session Status & Kiosk Controls Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#2864B4]" /> Attendance Session Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Attendance Session Name"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              required
            />

            <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
              <div>
                <p className="text-xs font-bold text-[#182230]">Session Status</p>
                <p className="text-[11px] text-[#667085]">
                  {sessionStatus === 'open'
                    ? 'Session is currently OPEN. Kiosk is accepting attendee check-ins.'
                    : 'Session is currently CLOSED. New check-ins will be rejected.'}
                </p>
              </div>

              <div className="flex items-center gap-2 mt-3 sm:mt-0">
                <Button
                  type="button"
                  variant={sessionStatus === 'open' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setSessionStatus('open')}
                >
                  <Unlock className="w-3.5 h-3.5 mr-1" /> Open Session
                </Button>
                <Button
                  type="button"
                  variant={sessionStatus === 'closed' ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() => setSessionStatus('closed')}
                >
                  <Lock className="w-3.5 h-3.5 mr-1" /> Close Session
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <label className="flex items-center gap-3 p-3 border border-[#E4E9F0] rounded-lg cursor-pointer bg-white">
                <input
                  type="checkbox"
                  checked={kioskEnabled}
                  onChange={(e) => setKioskEnabled(e.target.checked)}
                  className="rounded text-[#142D4E] focus:ring-[#2864B4] w-4 h-4"
                />
                <div>
                  <p className="text-xs font-semibold text-[#182230]">Kiosk Self-Service Enabled</p>
                  <p className="text-[10px] text-[#667085]">Allows attendees to interact with kiosk</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border border-[#E4E9F0] rounded-lg cursor-pointer bg-white">
                <input
                  type="checkbox"
                  checked={offlineAllowed}
                  onChange={(e) => setOfflineAllowed(e.target.checked)}
                  className="rounded text-[#142D4E] focus:ring-[#2864B4] w-4 h-4"
                />
                <div>
                  <p className="text-xs font-semibold text-[#182230]">Offline Attendance Permitted</p>
                  <p className="text-[10px] text-[#667085]">Kiosks cache data for offline recording</p>
                </div>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Security & Retention Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#2864B4]" /> Photograph Retention Policy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              label="Photo Retention Window (Days)"
              type="number"
              value={photoRetentionDays}
              onChange={(e) => setPhotoRetentionDays(parseInt(e.target.value, 10) || 365)}
              helperText="Attendance photographs are retained securely in private Supabase Storage according to institutional policy."
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSaving}
            className="shadow-sm px-8"
          >
            <Save className="w-4 h-4 mr-2" /> Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
