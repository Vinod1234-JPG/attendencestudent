'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Download,
  Trash2,
  FileText,
  RefreshCw,
  HelpCircle,
  Search,
  Filter,
  XCircle,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { normalizeEmail, isValidEmail, normalizePhdId, isValidPhdId } from '@/lib/utils/normalization';

type ImportStage = 'CATEGORY' | 'UPLOAD' | 'PREVIEW' | 'COMMIT' | 'RESULTS';

interface InvalidRowDetail {
  rowNumber: number;
  column: string;
  fieldLabel: string;
  reason: string;
  value: string;
  data: any;
}

export default function ImportPage() {
  const [stage, setStage] = useState<ImportStage>('CATEGORY');
  const [category, setCategory] = useState<'guide' | 'phd_scholar'>('guide');
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [validRows, setValidRows] = useState<any[]>([]);
  const [invalidRows, setInvalidRows] = useState<InvalidRowDetail[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Preview filtering, tabs, and viewing limit states
  const [statusFilterTab, setStatusFilterTab] = useState<'all' | 'valid' | 'invalid'>('all');
  const [previewLimit, setPreviewLimit] = useState<number | 'all'>('all');
  const [previewSearch, setPreviewSearch] = useState('');

  // Purge / Reset data states
  const [isPurging, setIsPurging] = useState(false);
  const [purgeSuccess, setPurgeSuccess] = useState<string | null>(null);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  const handlePurgeOldData = async () => {
    setIsPurging(true);
    setErrorMessage(null);
    setPurgeSuccess(null);
    try {
      const res = await fetch('/api/admin/attendees', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove old data.');
      setPurgeSuccess(data.message || 'All old attendee and attendance records were successfully removed. You can now upload fresh data.');
      setShowPurgeConfirm(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred while purging old data.');
    } finally {
      setIsPurging(false);
    }
  };

  // Template generators
  const downloadTemplate = (cat: 'guide' | 'phd_scholar', format: 'csv' | 'xlsx') => {
    let data: any[] = [];
    if (cat === 'guide') {
      data = [
        { name: 'Dr. Anand Sharma', email: 'anand.sharma@university.edu', Department: 'Computer Science', Phone: '9876543210' },
        { name: 'Prof. Meenakshi Iyer', email: 'm.iyer@institution.ac.in', Department: 'Information Science', Phone: '9876543211' },
      ];
    } else {
      data = [
        { name: 'Rajesh Verma', phd_id: '123456', Department: 'Mechanical Engineering', email: 'rajesh@gmail.com' },
        { name: 'Pooja Nair', phd_id: '123457', Department: 'Computer Science', email: 'pooja@gmail.com' },
      ];
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const filename = `MRF_${cat === 'guide' ? 'Guides' : 'PhDScholars'}_Template.${format}`;

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Template');
      XLSX.writeFile(wb, filename);
    }
  };

  // Export invalid rows to CSV so user can inspect and fix
  const downloadErrorsCsv = () => {
    if (invalidRows.length === 0) return;
    const errorData = invalidRows.map((inv) => ({
      'Row Number': inv.rowNumber,
      'Problem Column': inv.column,
      'Issue Description': inv.reason,
      'Current Value': inv.value || '<Empty>',
      ...inv.data,
    }));
    const ws = XLSX.utils.json_to_sheet(errorData);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MRF_Import_Errors_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle File Upload and Parsing
  const handleFileUpload = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setErrorMessage(null);
    setIsProcessing(true);
    setPreviewSearch('');
    setStatusFilterTab('all');
    setPreviewLimit('all');

    try {
      const buffer = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (rows.length === 0) {
        throw new Error('The uploaded file does not contain any data rows.');
      }

      setParsedRows(rows);
      const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
      setDetectedColumns(cols);

      // Local validation with exact column mapping
      const valid: any[] = [];
      const invalid: InvalidRowDetail[] = [];
      const seen = new Map<string, number>();

      rows.forEach((row, idx) => {
        const rowNumber = idx + 1;

        // Find name column key (case-insensitive lookup across common variants)
        const nameKey = Object.keys(row).find((k) =>
          ['name', 'Name', 'Full Name', 'Attendee Name', 'Guide Name', 'Scholar Name', 'Candidate Name'].some(
            (c) => k.trim().toLowerCase() === c.toLowerCase()
          )
        ) || 'name';

        const rawName = row[nameKey] ?? '';
        const name = String(rawName).trim();

        if (!name) {
          invalid.push({
            rowNumber,
            column: nameKey,
            fieldLabel: 'Attendee Name',
            reason: 'Attendee name is missing or blank',
            value: '',
            data: row,
          });
          return;
        }

        if (category === 'guide') {
          // Find email column key
          const emailKey = Object.keys(row).find((k) =>
            ['email', 'Email', 'Email Address', 'EMAIL', 'Email ID', 'Mail', 'E-mail'].some(
              (c) => k.trim().toLowerCase() === c.toLowerCase()
            )
          ) || 'email';

          const rawEmail = row[emailKey] ?? '';
          const emailStr = String(rawEmail).trim();
          const normalized = normalizeEmail(emailStr);

          if (!emailStr) {
            invalid.push({
              rowNumber,
              column: emailKey,
              fieldLabel: 'Email Address',
              reason: 'Email address is missing or blank',
              value: '',
              data: row,
            });
            return;
          }

          if (!normalized || !isValidEmail(normalized)) {
            invalid.push({
              rowNumber,
              column: emailKey,
              fieldLabel: 'Email Address',
              reason: `Invalid email format: "${emailStr}"`,
              value: emailStr,
              data: row,
            });
            return;
          }

          if (seen.has(normalized)) {
            const priorRow = seen.get(normalized);
            invalid.push({
              rowNumber,
              column: emailKey,
              fieldLabel: 'Email Address',
              reason: `Duplicate email: "${normalized}" was already used in Row #${priorRow}`,
              value: normalized,
              data: row,
            });
            return;
          }

          seen.set(normalized, rowNumber);
          valid.push({ name, email: normalized, rowNumber, rowData: row });
        } else {
          // Find PhD ID column key
          const idKey = Object.keys(row).find((k) =>
            ['phd_id', 'PhD ID', 'Ph.D ID', 'id', 'ID', 'USN', 'Scholar ID', 'Registration No', 'Reg No'].some(
              (c) => k.trim().toLowerCase() === c.toLowerCase()
            )
          ) || 'phd_id';

          const rawId = row[idKey] ?? '';
          const idStr = String(rawId).trim();
          const normalized = normalizePhdId(idStr);

          if (!idStr) {
            invalid.push({
              rowNumber,
              column: idKey,
              fieldLabel: 'PhD ID',
              reason: 'PhD ID is missing or blank',
              value: '',
              data: row,
            });
            return;
          }

          if (!normalized || !isValidPhdId(normalized)) {
            invalid.push({
              rowNumber,
              column: idKey,
              fieldLabel: 'PhD ID',
              reason: `Invalid PhD ID format: "${idStr}"`,
              value: idStr,
              data: row,
            });
            return;
          }

          if (seen.has(normalized)) {
            const priorRow = seen.get(normalized);
            invalid.push({
              rowNumber,
              column: idKey,
              fieldLabel: 'PhD ID',
              reason: `Duplicate PhD ID: "${normalized}" was already used in Row #${priorRow}`,
              value: normalized,
              data: row,
            });
            return;
          }

          seen.set(normalized, rowNumber);
          valid.push({ name, phd_id: normalized, rowNumber, rowData: row });
        }
      });

      setValidRows(valid);
      setInvalidRows(invalid);
      setStage('PREVIEW');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to read spreadsheet data.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitImport = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    // Send only valid rows to the server
    const rowsToSubmit = validRows.map((v) => v.rowData || parsedRows[v.rowNumber - 1]);

    try {
      const res = await fetch('/api/import/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          filename: file?.name || 'mrf_import',
          rows: rowsToSubmit,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Server rejected data import.');
      }

      setImportResult(data);
      setStage('RESULTS');
    } catch (err: any) {
      setErrorMessage(err.message || 'Import failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetImport = () => {
    setStage('CATEGORY');
    setFile(null);
    setParsedRows([]);
    setValidRows([]);
    setInvalidRows([]);
    setImportResult(null);
    setErrorMessage(null);
    setPreviewSearch('');
    setStatusFilterTab('all');
    setPreviewLimit('all');
  };

  // Filtered rows based on status tab and search query
  const filteredRows = useMemo(() => {
    let rows = parsedRows;
    const invalidRowNumbers = new Set(invalidRows.map((inv) => inv.rowNumber));

    // 1. Filter by status tab
    if (statusFilterTab === 'valid') {
      rows = rows.filter((_, idx) => !invalidRowNumbers.has(idx + 1));
    } else if (statusFilterTab === 'invalid') {
      rows = rows.filter((_, idx) => invalidRowNumbers.has(idx + 1));
    }

    // 2. Filter by search query
    if (!previewSearch.trim()) return rows;
    const q = previewSearch.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((val) => String(val ?? '').toLowerCase().includes(q))
    );
  }, [parsedRows, invalidRows, statusFilterTab, previewSearch]);

  // Rows currently displayed based on limit selection
  const displayedRows = useMemo(() => {
    if (previewLimit === 'all') return filteredRows;
    return filteredRows.slice(0, previewLimit);
  }, [filteredRows, previewLimit]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142D4E]">Upload MRF Attendee Data</h1>
          <p className="text-xs text-[#667085] mt-1">
            Import registered Guides and PhD Scholars from CSV or Excel spreadsheets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplate(category, 'csv')}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> CSV Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplate(category, 'xlsx')}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Excel Template
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-[#C0393A]/10 border border-[#C0393A]/20 text-[#C0393A] rounded-lg text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {purgeSuccess && (
        <div className="p-4 bg-[#16835D]/10 border border-[#16835D]/20 text-[#16835D] rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{purgeSuccess}</span>
          </div>
          <button
            onClick={() => setPurgeSuccess(null)}
            className="text-[11px] underline font-medium hover:text-[#0B1B30]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Fresh Start / Reset Old Data Banner */}
      <div className="p-4 bg-white border border-[#E4E9F0] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div>
          <h3 className="text-xs font-bold text-[#142D4E] flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5 text-[#C0393A]" /> Start Fresh: Uploading New Attendee Lists?
          </h3>
          <p className="text-[11px] text-[#667085] mt-0.5">
            Remove old test attendees, past check-ins, and previous records so you can upload fresh data without duplicate conflicts.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPurgeConfirm(true)}
          className="border-[#C0393A]/30 text-[#C0393A] hover:bg-[#C0393A]/10 text-xs shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove Old Data
        </Button>
      </div>

      {/* Confirmation Modal */}
      {showPurgeConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-[#E4E9F0] animate-in fade-in zoom-in-95">
            <div className="w-10 h-10 rounded-full bg-[#C0393A]/10 text-[#C0393A] flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[#142D4E]">Confirm Database Wipe</h3>
            <p className="text-xs text-[#667085] mt-2 leading-relaxed">
              Are you sure you want to delete all existing Guides, PhD Scholars, test attendance records, and photos?
              <br /><br />
              <strong>This will completely clear the attendee database so you can upload your new Excel / CSV files cleanly.</strong> Active event and session configurations will remain intact.
            </p>
            <div className="flex items-center justify-end gap-2.5 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPurgeConfirm(false)}
                disabled={isPurging}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handlePurgeOldData}
                isLoading={isPurging}
              >
                Yes, Remove All Old Data
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 1: SELECT CATEGORY */}
      {stage === 'CATEGORY' && (
        <Card className="p-8 text-center">
          <h2 className="text-lg font-bold text-[#142D4E] mb-2">Stage 1: Select Attendee Category</h2>
          <p className="text-xs text-[#667085] mb-6">
            Choose whether you are importing Guides or PhD Scholars. Templates differ by identification type.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto mb-6">
            <button
              onClick={() => setCategory('guide')}
              className={`p-6 rounded-xl border-2 text-left transition-all ${
                category === 'guide'
                  ? 'border-[#2864B4] bg-[#EAF2FC]/40 text-[#142D4E]'
                  : 'border-[#E4E9F0] bg-white text-[#667085] hover:border-[#CBD5E1]'
              }`}
            >
              <h3 className="font-bold text-base text-[#142D4E]">Guides</h3>
              <p className="text-xs text-[#667085] mt-1">
                Required columns: <code className="bg-[#EEF1F5] px-1 py-0.5 rounded">name</code>,{' '}
                <code className="bg-[#EEF1F5] px-1 py-0.5 rounded">email</code>
              </p>
            </button>

            <button
              onClick={() => setCategory('phd_scholar')}
              className={`p-6 rounded-xl border-2 text-left transition-all ${
                category === 'phd_scholar'
                  ? 'border-[#2864B4] bg-[#EAF2FC]/40 text-[#142D4E]'
                  : 'border-[#E4E9F0] bg-white text-[#667085] hover:border-[#CBD5E1]'
              }`}
            >
              <h3 className="font-bold text-base text-[#142D4E]">PhD Scholars</h3>
              <p className="text-xs text-[#667085] mt-1">
                Required columns: <code className="bg-[#EEF1F5] px-1 py-0.5 rounded">name</code>,{' '}
                <code className="bg-[#EEF1F5] px-1 py-0.5 rounded">phd_id</code>
              </p>
            </button>
          </div>

          <Button
            variant="primary"
            size="lg"
            onClick={() => setStage('UPLOAD')}
            className="px-8 shadow-sm"
          >
            Continue to Upload <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Card>
      )}

      {/* STAGE 2: UPLOAD FILE */}
      {stage === 'UPLOAD' && (
        <Card className="p-8">
          <button
            onClick={() => setStage('CATEGORY')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#667085] hover:text-[#142D4E] mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Category Selection
          </button>

          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-[#142D4E]">
              Stage 2: Upload {category === 'guide' ? 'Guides' : 'PhD Scholars'} File
            </h2>
            <p className="text-xs text-[#667085] mt-1">
              Supports CSV (`.csv`) and Microsoft Excel (`.xlsx`) files up to 10 MB.
            </p>
          </div>

          {/* Drag & Drop Area */}
          <div className="border-2 border-dashed border-[#CBD5E1] rounded-xl p-10 text-center hover:border-[#2864B4] transition-colors bg-[#F7F9FC]">
            <FileSpreadsheet className="w-12 h-12 text-[#2864B4] mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#182230]">
              Drag and drop your file here, or browse
            </p>
            <p className="text-xs text-[#667085] mt-1 mb-4">
              Columns expected: <strong>name</strong> and{' '}
              <strong>{category === 'guide' ? 'email' : 'phd_id'}</strong>
            </p>

            <label className="inline-block cursor-pointer">
              <span className="px-5 py-2.5 bg-[#142D4E] text-white rounded-md text-xs font-semibold hover:bg-[#0B1B30] transition-colors shadow-sm">
                Browse Files
              </span>
              <input
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
            </label>
          </div>
        </Card>
      )}

      {/* STAGE 3: PREVIEW & INSPECTION */}
      {stage === 'PREVIEW' && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#142D4E]">Stage 3: File Inspection & Preview</h2>
                <p className="text-xs text-[#667085]">
                  File: <strong>{file?.name}</strong> • Total rows detected: <strong>{parsedRows.length}</strong>
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleResetImport}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5 text-[#C0393A]" /> Cancel & Re-upload
              </Button>
            </div>

            {/* Validation Counts Summary Cards (Interactive Filters) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <button
                type="button"
                onClick={() => setStatusFilterTab('all')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  statusFilterTab === 'all'
                    ? 'border-[#142D4E] bg-[#142D4E]/5 ring-2 ring-[#142D4E]/20'
                    : 'border-[#E4E9F0] bg-[#F7F9FC] hover:border-[#CBD5E1]'
                }`}
              >
                <span className="text-xs text-[#667085] block">Total Rows</span>
                <p className="text-2xl font-extrabold text-[#142D4E] mt-0.5">{parsedRows.length}</p>
                <span className="text-[11px] text-[#667085] mt-1 block">Click to view all</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilterTab('valid')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  statusFilterTab === 'valid'
                    ? 'border-[#16835D] bg-[#16835D]/10 ring-2 ring-[#16835D]/20'
                    : 'border-[#16835D]/20 bg-[#16835D]/5 hover:border-[#16835D]/50'
                }`}
              >
                <span className="text-xs text-[#16835D] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Valid Ready to Import
                </span>
                <p className="text-2xl font-extrabold text-[#16835D] mt-0.5">{validRows.length}</p>
                <span className="text-[11px] text-[#16835D] mt-1 block">Click to view only valid</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilterTab('invalid')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  statusFilterTab === 'invalid'
                    ? 'border-[#C0393A] bg-[#C0393A]/15 ring-2 ring-[#C0393A]/30'
                    : invalidRows.length > 0
                    ? 'border-[#C0393A]/30 bg-[#C0393A]/10 hover:border-[#C0393A]/60'
                    : 'border-[#E4E9F0] bg-[#F7F9FC] opacity-60'
                }`}
              >
                <span className="text-xs text-[#C0393A] font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Invalid or Duplicate
                </span>
                <p className="text-2xl font-extrabold text-[#C0393A] mt-0.5">{invalidRows.length}</p>
                <span className="text-[11px] text-[#C0393A] mt-1 block font-medium">
                  {invalidRows.length > 0 ? 'Click to inspect & sort out issues' : 'No errors found'}
                </span>
              </button>
            </div>

            {/* ACTIONABLE ISSUE RESOLUTION BOX (When errors exist) */}
            {invalidRows.length > 0 && (
              <div className="mb-6 p-4 bg-[#FEF2F2] border-2 border-[#EF4444]/40 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#FECACA] pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#EF4444] text-white flex items-center justify-center font-bold text-xs shrink-0">
                      !
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#991B1B]">
                        {invalidRows.length} {invalidRows.length === 1 ? 'Row Requires Attention to Sort Out:' : 'Rows Require Attention to Sort Out:'}
                      </h4>
                      <p className="text-[11px] text-[#7F1D1D]">
                        The specific problem columns are highlighted in red below. You can inspect them, download an error report, or choose to import only the {validRows.length} valid rows.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStatusFilterTab('invalid')}
                      className="bg-white border-[#EF4444] text-[#B91C1C] hover:bg-[#FEF2F2] text-xs"
                    >
                      Filter Table to Problem Rows ({invalidRows.length})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadErrorsCsv}
                      className="bg-white border-[#EF4444] text-[#B91C1C] hover:bg-[#FEF2F2] text-xs"
                    >
                      <Download className="w-3 h-3 mr-1" /> Export Errors (CSV)
                    </Button>
                  </div>
                </div>

                {/* List of specific row errors */}
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {invalidRows.map((inv) => (
                    <div
                      key={inv.rowNumber}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2.5 rounded-lg bg-white border border-[#FECACA] shadow-2xs text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#B91C1C] bg-[#FEE2E2] px-2 py-0.5 rounded text-[11px]">
                          Row #{inv.rowNumber}
                        </span>
                        <span className="font-semibold text-[#182230]">
                          Problem Column: <span className="underline decoration-[#EF4444] decoration-2 text-[#991B1B] font-mono">&quot;{inv.column}&quot;</span>
                        </span>
                      </div>
                      <div className="text-[11px] text-[#DC2626] font-medium flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{inv.reason}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detected Columns List */}
            <div className="mb-4 p-3 bg-[#EAF2FC]/60 border border-[#2864B4]/20 rounded-lg">
              <span className="text-xs font-bold text-[#142D4E] block mb-1.5">
                All Detected Columns from Uploaded Spreadsheet ({detectedColumns.length}):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {detectedColumns.map((col) => (
                  <span
                    key={col}
                    className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-white border border-[#CBD5E1] text-[#142D4E]"
                  >
                    {col}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-[#667085] mt-1.5">
                All column details and metadata will be permanently stored and associated with each attendee&apos;s record.
              </p>
            </div>

            {/* Preview Filter & View Selector Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              {/* Filter Tabs */}
              <div className="inline-flex rounded-lg border border-[#CBD5E1] p-0.5 bg-[#F7F9FC] text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilterTab('all')}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                    statusFilterTab === 'all'
                      ? 'bg-white text-[#142D4E] shadow-xs'
                      : 'text-[#667085] hover:text-[#182230]'
                  }`}
                >
                  All Rows ({parsedRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilterTab('valid')}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                    statusFilterTab === 'valid'
                      ? 'bg-white text-[#16835D] shadow-xs'
                      : 'text-[#667085] hover:text-[#16835D]'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3 text-[#16835D]" />
                  Valid ({validRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilterTab('invalid')}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                    statusFilterTab === 'invalid'
                      ? 'bg-[#EF4444] text-white shadow-xs'
                      : invalidRows.length > 0
                      ? 'text-[#C0393A] hover:bg-[#FEE2E2]'
                      : 'text-[#94A3B8]'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Invalid or Duplicate ({invalidRows.length})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Search within preview */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#667085]" />
                  <input
                    type="text"
                    placeholder="Search in preview..."
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs border border-[#CBD5E1] rounded-md focus:outline-none focus:ring-1 focus:ring-[#2864B4] bg-white w-40 sm:w-48 text-[#182230]"
                  />
                </div>

                {/* Row View Limit Selector */}
                <div className="inline-flex rounded-md shadow-xs border border-[#CBD5E1] overflow-hidden text-xs bg-white">
                  {[10, 50, 100, 'all'].map((val) => {
                    const label = val === 'all' ? `All (${filteredRows.length})` : String(val);
                    const active = previewLimit === val;
                    return (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => setPreviewLimit(val as any)}
                        className={`px-2.5 py-1.5 font-medium transition-colors ${
                          active
                            ? 'bg-[#142D4E] text-white font-semibold'
                            : 'text-[#667085] hover:bg-[#F7F9FC] hover:text-[#182230]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* PREVIEW TABLE WITH VISUAL COLUMN HIGHLIGHTING */}
            <div className="overflow-x-auto border border-[#E4E9F0] rounded-lg mb-6 max-h-[520px]">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[#F7F9FC] text-[#667085] border-b border-[#E4E9F0] sticky top-0 z-10 shadow-xs">
                  <tr>
                    <th className="px-4 py-2.5 font-bold bg-[#F7F9FC] w-16 text-center">Row #</th>
                    {/* Validation Status placed as 2nd column for immediate visibility! */}
                    <th className="px-4 py-2.5 font-bold bg-[#F7F9FC] min-w-[200px]">Validation Status</th>
                    {detectedColumns.map((col) => (
                      <th key={col} className="px-4 py-2.5 font-semibold bg-[#F7F9FC]">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E9F0]">
                  {displayedRows.length === 0 ? (
                    <tr>
                      <td colSpan={detectedColumns.length + 2} className="px-4 py-8 text-center text-[#667085]">
                        {statusFilterTab === 'invalid'
                          ? 'No invalid or duplicate rows detected! All records are valid.'
                          : `No rows matching "${previewSearch}".`}
                      </td>
                    </tr>
                  ) : (
                    displayedRows.map((row, idx) => {
                      const originalIdx = parsedRows.indexOf(row);
                      const rowNum = originalIdx !== -1 ? originalIdx + 1 : idx + 1;
                      const invalidItem = invalidRows.find((inv) => inv.rowNumber === rowNum);
                      const isInvalid = !!invalidItem;

                      return (
                        <tr
                          key={idx}
                          className={`transition-colors ${
                            isInvalid
                              ? 'bg-[#FEF2F2]/70 hover:bg-[#FEE2E2]'
                              : 'hover:bg-[#F7F9FC]/70'
                          }`}
                        >
                          {/* Row Number */}
                          <td className="px-4 py-2.5 text-center font-mono font-bold text-[#667085]">
                            {rowNum}
                          </td>

                          {/* Validation Status (2nd Column) */}
                          <td className="px-4 py-2.5">
                            {invalidItem ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B] font-bold text-xs">
                                <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />
                                <span>{invalidItem.reason}</span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#16835D] bg-[#16835D]/10 px-2 py-0.5 rounded-full border border-[#16835D]/20">
                                <CheckCircle2 className="w-3 h-3" /> Ready
                              </span>
                            )}
                          </td>

                          {/* Data Columns with Specific Error Cell Highlighting */}
                          {detectedColumns.map((col) => {
                            const isErrorColumn = isInvalid && invalidItem.column === col;
                            const cellValue = String(row[col] ?? '');

                            if (isErrorColumn) {
                              return (
                                <td
                                  key={col}
                                  className="px-4 py-2.5 bg-[#FEE2E2] border-2 border-[#EF4444] text-[#991B1B] font-bold shadow-2xs"
                                  title={`Issue in column "${col}": ${invalidItem.reason}`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <XCircle className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />
                                    <span>{cellValue || '<Empty Blank>'}</span>
                                  </div>
                                </td>
                              );
                            }

                            return (
                              <td
                                key={col}
                                className={`px-4 py-2.5 ${
                                  isInvalid ? 'text-[#475467]' : 'text-[#182230]'
                                }`}
                              >
                                {cellValue || '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Confirmation actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-[#E4E9F0]">
              <div className="text-xs text-[#667085]">
                {invalidRows.length > 0 ? (
                  <span className="text-[#B91C1C] font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {invalidRows.length} invalid row(s) will be excluded. {validRows.length} valid row(s) ready to import.
                  </span>
                ) : (
                  <span className="text-[#16835D] font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    All {validRows.length} rows verified and ready to commit.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <Button variant="outline" size="md" onClick={() => setStage('UPLOAD')}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleCommitImport}
                  isLoading={isProcessing}
                  disabled={validRows.length === 0}
                  className={invalidRows.length > 0 ? 'bg-[#2864B4] hover:bg-[#1E4D8C]' : ''}
                >
                  {invalidRows.length > 0
                    ? `Confirm and Import ${validRows.length} Valid Attendees (Skip ${invalidRows.length} Invalid)`
                    : `Confirm and Import ${validRows.length} Attendees`}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* STAGE 5: RESULTS */}
      {stage === 'RESULTS' && importResult && (
        <Card className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#16835D]/10 text-[#16835D] flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-extrabold text-[#142D4E]">Import Completed</h2>
          <p className="text-xs text-[#667085] mt-1 mb-6">
            The attendee records have been committed to the Maharaja Research Foundation database.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto mb-8">
            <div className="p-4 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
              <span className="text-xs text-[#667085]">Total Processed</span>
              <p className="text-2xl font-bold text-[#142D4E]">{importResult.total_rows}</p>
            </div>
            <div className="p-4 bg-[#16835D]/10 border border-[#16835D]/20 rounded-lg">
              <span className="text-xs text-[#16835D] font-medium">Newly Created</span>
              <p className="text-2xl font-bold text-[#16835D]">{importResult.created_count ?? 0}</p>
            </div>
            <div className="p-4 bg-[#2864B4]/10 border border-[#2864B4]/20 rounded-lg">
              <span className="text-xs text-[#2864B4] font-medium">Existing Updated</span>
              <p className="text-2xl font-bold text-[#2864B4]">{importResult.updated_count ?? 0}</p>
            </div>
            <div className="p-4 bg-[#C0393A]/10 border border-[#C0393A]/20 rounded-lg">
              <span className="text-xs text-[#C0393A] font-medium">Errors</span>
              <p className="text-2xl font-bold text-[#C0393A]">{importResult.error_count ?? 0}</p>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <Button variant="outline" size="md" onClick={handleResetImport}>
              Upload Another File
            </Button>
            <Link href="/admin/attendees">
              <Button variant="secondary" size="md">
                View Registered Attendees
              </Button>
            </Link>
            <Link href="/kiosk/ready">
              <Button variant="primary" size="md">
                <RefreshCw className="w-4 h-4 mr-2" /> Sync to Kiosk Offline Cache
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
