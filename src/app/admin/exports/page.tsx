'use client';

import React, { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Archive,
  HardDrive,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { getOfflineDb } from '@/lib/db/dexie';
import JSZip from 'jszip';

export default function ExportsPage() {
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<string | null>(null);

  // Trigger server-generated downloads
  const handleServerExport = async (format: 'csv' | 'xlsx' | 'zip', category: 'all' | 'guide' | 'phd_scholar') => {
    const key = `${format}_${category}`;
    setIsExporting(key);

    try {
      const url = `/api/exports?format=${format}&category=${category}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error('Export generation failed.');
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `MRF_Attendance_${category}.${format}`;
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

      // Add manifest.json and manifest.csv
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
        `MAHARAJA RESEARCH FOUNDATION - EMERGENCY OFFLINE RECOVERY EXPORT
Generated directly from kiosk IndexedDB device storage.
Total records extracted: ${pendingRecords.length}
NOTE: These records represent attendance captured locally on this hardware device.
`
      );

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `MRF_Offline_Recovery_${new Date().toISOString().slice(0, 10)}.zip`;
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
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#142D4E]">Export Attendance Details</h1>
        <p className="text-xs text-[#667085] mt-1">
          Download authenticated attendance reports, official spreadsheets, and archived photograph bundles.
        </p>
      </div>

      {/* CSV / Excel Formats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CSV Exports */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2864B4]" /> CSV Reports
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-[#667085] mb-2">
              Standard RFC 4180 CSV exports with formula injection sanitization.
            </p>

            <div className="flex items-center justify-between p-3 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
              <div>
                <p className="text-xs font-bold text-[#182230]">Guides Attendance (CSV)</p>
                <p className="text-[11px] text-[#667085]">Verified Guides check-ins only</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleServerExport('csv', 'guide')}
                isLoading={isExporting === 'csv_guide'}
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
              <div>
                <p className="text-xs font-bold text-[#182230]">PhD Scholars Attendance (CSV)</p>
                <p className="text-[11px] text-[#667085]">Verified PhD Scholars check-ins only</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleServerExport('csv', 'phd_scholar')}
                isLoading={isExporting === 'csv_phd_scholar'}
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
              <div>
                <p className="text-xs font-bold text-[#182230]">Combined Attendance (CSV)</p>
                <p className="text-[11px] text-[#667085]">All verified event attendees</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleServerExport('csv', 'all')}
                isLoading={isExporting === 'csv_all'}
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export All
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Excel (.xlsx) Exports */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#16835D]" /> Microsoft Excel Workbooks (.xlsx)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-[#667085] mb-2">
              Formatted multi-column spreadsheets with auto-adjusted widths and types.
            </p>

            <div className="flex items-center justify-between p-3 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
              <div>
                <p className="text-xs font-bold text-[#182230]">Guides Attendance (Excel)</p>
                <p className="text-[11px] text-[#667085]">Formatted workbook for Guides</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleServerExport('xlsx', 'guide')}
                isLoading={isExporting === 'xlsx_guide'}
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
              <div>
                <p className="text-xs font-bold text-[#182230]">PhD Scholars Attendance (Excel)</p>
                <p className="text-[11px] text-[#667085]">Formatted workbook for PhD Scholars</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleServerExport('xlsx', 'phd_scholar')}
                isLoading={isExporting === 'xlsx_phd_scholar'}
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
              <div>
                <p className="text-xs font-bold text-[#182230]">Combined Attendance (Excel)</p>
                <p className="text-[11px] text-[#667085]">Full official research retreat attendance workbook</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleServerExport('xlsx', 'all')}
                isLoading={isExporting === 'xlsx_all'}
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export All
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Photographs ZIP Archive */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="w-4 h-4 text-[#142D4E]" /> Attendance Photographs ZIP Archive
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-[#667085] mb-4">
            Generates a signed ZIP archive containing verified attendee photographs from private Supabase Storage, an audit manifest (<code>manifest.csv</code>) linking each photo to its attendee and timestamp, and institutional retention documentation.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-4 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
            <div>
              <p className="text-sm font-bold text-[#142D4E]">All Event Attendance Photographs (ZIP)</p>
              <p className="text-xs text-[#667085]">Includes verified photos, manifest, and README</p>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => handleServerExport('zip', 'all')}
              isLoading={isExporting === 'zip_all'}
              className="w-full sm:w-auto"
            >
              <Download className="w-4 h-4 mr-2" /> Download Photos Archive
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Offline Recovery Export */}
      <Card className="border-[#B7791F]/30 bg-[#FFFDF5]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-[#B7791F]">
            <HardDrive className="w-4 h-4" /> Emergency Offline Recovery Export
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-[#667085] mb-4">
            If the kiosk device experienced hardware or network disconnection and cannot synchronize to the server, use this emergency export to extract all locally queued records and raw photographic Blobs directly from the device's IndexedDB storage.
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
