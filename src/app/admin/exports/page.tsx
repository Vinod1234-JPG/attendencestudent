'use client';

import React, { useEffect, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Archive,
  HardDrive,
  Users,
  Camera,
  Award,
  Sparkles,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getOfflineDb } from '@/lib/db/dexie';
import JSZip from 'jszip';

export default function ExportsPage() {
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<string | null>(null);

  // Event / Room: every export (PDF, Excel, CSV, ZIP) can be limited to one event or room
  const [rooms, setRooms] = useState<{ name: string; students: number }[]>([]);
  const [room, setRoom] = useState('');

  useEffect(() => {
    fetch(`/api/admin/event-rooms?_t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.rooms || [];
        setRooms(list);
        if (list.length === 1) setRoom(list[0].name); // only one: export it by name
      })
      .catch(() => {});
  }, []);

  // Trigger server-generated downloads
  const handleServerExport = async (
    format: 'csv' | 'xlsx' | 'zip' | 'pdf',
    category: 'all' | 'guide' | 'phd_scholar' | 'student',
    source: 'attendance' | 'registered' = 'attendance'
  ) => {
    const key = `${format}_${category}_${source}`;
    setIsExporting(key);

    try {
      const url = `/api/exports?format=${format}&category=${category}&source=${source}${
        room ? `&event_room=${encodeURIComponent(room)}` : ''
      }`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error('Export generation failed.');
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `MITM_Students_${source === 'registered' ? 'Registered_Directory' : 'Attendance'}.${format}`;
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (e: any) {
      alert(e.message || 'Export failed.');
    } finally {
      setIsExporting(null);
    }
  };

  // Offline Emergency Recovery Export directly from IndexedDB
  const handleOfflineRecoveryExport = async () => {
    setIsExporting('offline_recovery');
    setRecoveryStatus('Reading pending records and photographs from IndexedDB...');

    try {
      const db = getOfflineDb();
      const pendingRecords = await db.attendance_queue.toArray();

      if (pendingRecords.length === 0) {
        setRecoveryStatus('No offline attendance records found in local device database.');
        setIsExporting(null);
        return;
      }

      const zip = new JSZip();
      const photosFolder = zip.folder('local_photos');

      // Manifest
      const manifestRows = pendingRecords.map((r, idx) => ({
        'S.No': idx + 1,
        'Operation ID': r.operation_id,
        'Session ID': r.session_id,
        'Person ID': r.person_id,
        Category: r.category,
        Identifier: r.identifier,
        'Attendee Name': r.person_name,
        'Local Capture Time': r.captured_at_device,
        'Sync Status': r.sync_status,
        'Photo Filename': `${r.operation_id}.jpg`,
      }));

      // Add manifest.json
      zip.file('recovery_manifest.json', JSON.stringify(manifestRows, null, 2));

      // Append photographs
      for (const rec of pendingRecords) {
        if (rec.photo_blob) {
          const buf = await rec.photo_blob.arrayBuffer();
          photosFolder?.file(`${rec.operation_id}.jpg`, buf);
        }
      }

      zip.file(
        'RECOVERY_NOTICE.txt',
        `MIT MYSORE STUDENT ATTENDANCE TRACKER - EMERGENCY OFFLINE RECOVERY EXPORT
Generated directly from kiosk IndexedDB device storage.
Total records extracted: ${pendingRecords.length}
NOTE: These records represent attendance captured locally on this hardware device.
`
      );

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `MITM_Students_Offline_Recovery_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      window.URL.revokeObjectURL(downloadUrl);

      setRecoveryStatus(`Recovery ZIP downloaded successfully! Contains ${pendingRecords.length} attendee records.`);
    } catch (err: any) {
      console.error('Offline recovery export error:', err);
      setRecoveryStatus(`Error during recovery extraction: ${err.message}`);
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#142D4E]">Export Attendance Details</h1>
        <p className="text-xs text-[#667085] mt-1">
          Download authenticated attendance reports, printable PDF verification dossiers with photos, spreadsheets, and archived photograph bundles.
        </p>
      </div>

      {/* Event / Room to export */}
      <div className="flex flex-col gap-3 rounded-xl border border-[#D6E4F5] bg-[#F5F9FF] p-4 sm:flex-row sm:items-center">
        <label htmlFor="export-room" className="flex items-center gap-2 text-sm font-bold text-[#142D4E] shrink-0">
          <MapPin className="w-4 h-4 text-[#2864B4]" /> Event / Room
        </label>
        <select
          id="export-room"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="h-10 w-full sm:max-w-md rounded-lg border border-[#D0D5DD] bg-white px-3 text-sm outline-none focus:border-[#2864B4] focus:ring-2 focus:ring-[#2864B4]/20"
        >
          <option value="">All events / rooms</option>
          {rooms.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name} ({r.students} student{r.students === 1 ? '' : 's'})
            </option>
          ))}
        </select>
        <p className="text-xs text-[#667085]">
          Downloads below include only this event / room, and its name is printed at the top and bottom of the PDF.
        </p>
      </div>

      {/* Primary Export Cards (PDF, Excel, CSV in 3-column grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Official PDF Dossiers (With Photos) */}
        <Card className="border-2 border-[#142D4E]/30 bg-gradient-to-br from-white to-[#F7F9FC] shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-[#142D4E]">
                  <FileText className="w-5 h-5 text-[#C93B2B]" /> PDF Documents (.pdf)
                </CardTitle>
                <Badge variant="blue" className="bg-[#EAF2FC] text-[#2864B4] border border-[#2864B4]/30 text-[10px] font-semibold">
                  With Photos
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <p className="text-xs text-[#667085] mb-2">
                Printable landscape PDF with each student's photo, name, college and check-in time.
              </p>

              {/* All students PDF */}
              <div className="p-3 bg-[#142D4E] text-white rounded-lg shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#84ADFF] shrink-0" /> Student Attendance (PDF)
                    </p>
                    <p className="text-[11px] text-[#CBD5E1] truncate">All checked-in students with photos</p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleServerExport('pdf', 'all')}
                    isLoading={isExporting === 'pdf_all_attendance'}
                    className="shrink-0 text-xs bg-[#2864B4] hover:bg-[#1E4D8C] text-white"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> PDF All
                  </Button>
                </div>
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Card 2: Microsoft Excel Workbooks (.xlsx) */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-[#182230]">
                  <FileSpreadsheet className="w-5 h-5 text-[#16835D]" /> Microsoft Excel (.xlsx)
                </CardTitle>
                <Badge variant="neutral" className="text-[10px]">Spreadsheets</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <p className="text-xs text-[#667085] mb-2">
                Spreadsheet of student names, colleges and check-in times.
              </p>

              {/* All students Excel */}
              <div className="p-3 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#182230]">Student Attendance (Excel)</p>
                    <p className="text-[11px] text-[#667085] truncate">All checked-in students</p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleServerExport('xlsx', 'all')}
                    isLoading={isExporting === 'xlsx_all_attendance'}
                    className="shrink-0 text-xs"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> Export All
                  </Button>
                </div>
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Card 3: CSV Reports */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-[#182230]">
                  <FileText className="w-5 h-5 text-[#2864B4]" /> CSV Reports (.csv)
                </CardTitle>
                <Badge variant="neutral" className="text-[10px]">Plain Data</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <p className="text-xs text-[#667085] mb-2">
                Standard RFC 4180 CSV exports with formula injection sanitization, suitable for external SIS or database import.
              </p>

              {/* All students CSV */}
              <div className="p-3 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#182230]">Student Attendance (CSV)</p>
                    <p className="text-[11px] text-[#667085] truncate">All checked-in students</p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleServerExport('csv', 'all')}
                    isLoading={isExporting === 'csv_all_attendance'}
                    className="shrink-0 text-xs"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> Export All
                  </Button>
                </div>
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Secondary Section: Master Registry Dossier & Photos Archive */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Master Registered Directory Dossier */}
        <Card className="border border-[#2864B4]/20 bg-gradient-to-br from-white to-[#F0F5FC]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-[#142D4E]">
              <Users className="w-4 h-4 text-[#2864B4]" /> All Registered Students
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-[#667085]">
              Export every student who has registered at the kiosk, with their college and check-in status (with photos if checked in).
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleServerExport('pdf', 'all', 'registered')}
                isLoading={isExporting === 'pdf_all_registered'}
                className="flex-1 bg-white border-[#2864B4]/40 hover:bg-[#EAF2FC] text-[#142D4E]"
              >
                <Download className="w-3.5 h-3.5 mr-1.5 text-[#C93B2B]" /> Complete Registry (PDF with Photos)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleServerExport('xlsx', 'all', 'registered')}
                isLoading={isExporting === 'xlsx_all_registered'}
                className="flex-1 bg-white border-[#16835D]/40 hover:bg-[#EAF7EE] text-[#142D4E]"
              >
                <Download className="w-3.5 h-3.5 mr-1.5 text-[#16835D]" /> Complete Registry (Excel)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Photographs ZIP Archive */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-[#142D4E]">
              <Archive className="w-4 h-4 text-[#142D4E]" /> Attendance Photographs ZIP Archive
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-[#667085]">
              Generates a signed ZIP archive containing verified attendee photographs from private Supabase Storage, an audit manifest (<code>manifest.csv</code>) linking each photo to its attendee and timestamp, and retention documentation.
            </p>

            <div className="flex items-center justify-between p-3 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
              <div>
                <p className="text-xs font-bold text-[#142D4E]">All Event Photographs (ZIP)</p>
                <p className="text-[11px] text-[#667085]">Includes verified photos, manifest, and README</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleServerExport('zip', 'all')}
                isLoading={isExporting === 'zip_all_attendance'}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download Photos Archive
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Emergency Offline Recovery Export */}
      <Card className="border-[#B7791F]/30 bg-[#FFFDF5]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-[#B7791F]">
            <HardDrive className="w-4 h-4" /> Emergency Offline Recovery Export
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-[#667085] mb-4">
            If the kiosk device experienced hardware or network disconnection and cannot synchronize to the server, use this emergency export to extract all locally queued records and raw photographic Blobs directly from the device&apos;s IndexedDB storage.
          </p>

          {recoveryStatus && (
            <div className="p-3 bg-white border border-[#B7791F]/40 rounded-lg text-xs font-medium text-[#182230] mb-4">
              {recoveryStatus}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="md"
              onClick={handleOfflineRecoveryExport}
              isLoading={isExporting === 'offline_recovery'}
              className="border-[#B7791F] text-[#B7791F] hover:bg-[#B7791F]/10"
            >
              <Download className="w-4 h-4 mr-2" /> Export Local Device Attendance
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
