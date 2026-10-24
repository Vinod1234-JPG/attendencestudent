'use client';

import React, { useState } from 'react';
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
  HelpCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { normalizeEmail, isValidEmail, normalizePhdId, isValidPhdId } from '@/lib/utils/normalization';

type ImportStage = 'CATEGORY' | 'UPLOAD' | 'PREVIEW' | 'COMMIT' | 'RESULTS';

export default function ImportPage() {
  const [stage, setStage] = useState<ImportStage>('CATEGORY');
  const [category, setCategory] = useState<'guide' | 'phd_scholar'>('guide');
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [validRows, setValidRows] = useState<any[]>([]);
  const [invalidRows, setInvalidRows] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Template generators
  const downloadTemplate = (cat: 'guide' | 'phd_scholar', format: 'csv' | 'xlsx') => {
    let data: any[] = [];
    if (cat === 'guide') {
      data = [
        { name: 'Dr. Anand Sharma', email: 'anand.sharma@university.edu' },
        { name: 'Prof. Meenakshi Iyer', email: 'm.iyer@institution.ac.in' },
      ];
    } else {
      data = [
        { name: 'Rajesh Verma', phd_id: 'MRF-PHD-2026-001' },
        { name: 'Pooja Nair', phd_id: 'MRF-PHD-2026-002' },
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

  // Handle File Upload and Parsing
  const handleFileUpload = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setErrorMessage(null);
    setIsProcessing(true);

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

      // Local validation
      const valid: any[] = [];
      const invalid: any[] = [];
      const seen = new Set<string>();

      rows.forEach((row, idx) => {
        const rawName = row.name || row.Name || row['Full Name'] || '';
        const name = String(rawName).trim();

        if (!name) {
          invalid.push({ rowNumber: idx + 1, reason: 'Missing attendee name', data: row });
          return;
        }

        if (category === 'guide') {
          const rawEmail = row.email || row.Email || row['Email Address'] || '';
          const normalized = normalizeEmail(String(rawEmail));
          if (!normalized || !isValidEmail(normalized)) {
            invalid.push({ rowNumber: idx + 1, reason: 'Invalid or missing email address', data: row });
            return;
          }
          if (seen.has(normalized)) {
            invalid.push({ rowNumber: idx + 1, reason: 'Duplicate email in file', data: row });
            return;
          }
          seen.add(normalized);
          valid.push({ name, email: normalized, rowNumber: idx + 1 });
        } else {
          const rawId = row.phd_id || row['PhD ID'] || row['Ph.D ID'] || row.id || row.ID || '';
          const normalized = normalizePhdId(String(rawId));
          if (!normalized || !isValidPhdId(normalized)) {
            invalid.push({ rowNumber: idx + 1, reason: 'Invalid or missing PhD ID', data: row });
            return;
          }
          if (seen.has(normalized)) {
            invalid.push({ rowNumber: idx + 1, reason: 'Duplicate PhD ID in file', data: row });
            return;
          }
          seen.add(normalized);
          valid.push({ name, phd_id: normalized, rowNumber: idx + 1 });
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

  // Commit Import to Server
  const handleCommitImport = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/import/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          filename: file?.name || 'mrf_import',
          rows: parsedRows,
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
  };

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

      {/* STAGE 3: PREVIEW */}
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

            {/* Validation Counts */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
                <span className="text-xs text-[#667085]">Total Rows</span>
                <p className="text-xl font-bold text-[#142D4E]">{parsedRows.length}</p>
              </div>
              <div className="p-4 bg-[#16835D]/10 border border-[#16835D]/20 rounded-lg">
                <span className="text-xs text-[#16835D] font-medium">Valid Ready to Import</span>
                <p className="text-xl font-bold text-[#16835D]">{validRows.length}</p>
              </div>
              <div className="p-4 bg-[#C0393A]/10 border border-[#C0393A]/20 rounded-lg">
                <span className="text-xs text-[#C0393A] font-medium">Invalid or Duplicate</span>
                <p className="text-xl font-bold text-[#C0393A]">{invalidRows.length}</p>
              </div>
            </div>

            {/* Preview Sample Table */}
            <h3 className="text-xs font-bold text-[#182230] uppercase mb-2">Preview (First 5 Rows)</h3>
            <div className="overflow-x-auto border border-[#E4E9F0] rounded-lg mb-6">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F9FC] text-[#667085] border-b border-[#E4E9F0]">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Row</th>
                    <th className="px-4 py-2.5 font-semibold">Attendee Name</th>
                    <th className="px-4 py-2.5 font-semibold">
                      {category === 'guide' ? 'Email Address' : 'PhD ID'}
                    </th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E9F0]">
                  {parsedRows.slice(0, 5).map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-[#667085]">{idx + 1}</td>
                      <td className="px-4 py-2 font-medium text-[#182230]">
                        {row.name || row.Name || '—'}
                      </td>
                      <td className="px-4 py-2 font-mono text-[#667085]">
                        {category === 'guide'
                          ? row.email || row.Email || '—'
                          : row.phd_id || row['PhD ID'] || row.id || '—'}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="success">Validated</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Confirmation actions */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" size="md" onClick={() => setStage('UPLOAD')}>
                Back
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleCommitImport}
                isLoading={isProcessing}
                disabled={validRows.length === 0}
              >
                Confirm and Import {validRows.length} Attendees
              </Button>
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

          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mb-8">
            <div className="p-4 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg">
              <span className="text-xs text-[#667085]">Processed</span>
              <p className="text-2xl font-bold text-[#142D4E]">{importResult.total_rows}</p>
            </div>
            <div className="p-4 bg-[#16835D]/10 border border-[#16835D]/20 rounded-lg">
              <span className="text-xs text-[#16835D] font-medium">Created</span>
              <p className="text-2xl font-bold text-[#16835D]">{importResult.success_count}</p>
            </div>
            <div className="p-4 bg-[#C0393A]/10 border border-[#C0393A]/20 rounded-lg">
              <span className="text-xs text-[#C0393A] font-medium">Skipped/Errors</span>
              <p className="text-2xl font-bold text-[#C0393A]">{importResult.error_count}</p>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <Button variant="outline" size="md" onClick={handleResetImport}>
              Upload Another File
            </Button>
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
