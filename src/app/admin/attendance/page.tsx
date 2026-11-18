'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Filter,
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  Clock,
  ShieldCheck,
  CheckCircle2,
  X,
  Mail,
  Award,
  Trash2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { usePolling } from '@/lib/hooks/usePolling';

export default function AttendanceRecordsPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const searchRef = useRef('');
  searchRef.current = debouncedSearch;

  // Selected record for details modal
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Deletion modal state
  const [recordToDelete, setRecordToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Real-time debounce: trigger as user types after 250ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchRecords = async (term = searchRef.current) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search: (term ?? '').trim(),
        category,
        _t: Date.now().toString(),
      });

      const res = await fetch(`/api/attendance?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setRecords(data.records || []);
        setTotalPages(data.pagination?.total_pages || 1);
        setTotalCount(data.pagination?.total || 0);
      }
    } catch (e) {
      console.warn('Failed to load attendance records:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords(debouncedSearch);
  }, [page, category, limit, debouncedSearch]);

  // Refresh every 20 s, but only while this tab is visible
  usePolling(() => fetchRecords(searchRef.current), 20000);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search);
    setPage(1);
    fetchRecords(search);
  };

  const handleClearSearch = () => {
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
    fetchRecords('');
  };

  const forceCacheClear = () => {
    if (typeof window !== 'undefined' && 'caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }
    fetchRecords(searchRef.current);
  };

  // Safe removal of attendance record only (preserves registered person in database)
  const handleDeleteAttendance = async () => {
    if (!recordToDelete) return;
    setIsDeleting(true);
    setActionFeedback(null);

    try {
      const res = await fetch(`/api/attendance?id=${encodeURIComponent(recordToDelete.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setActionFeedback({
          type: 'success',
          message: `Attendance for "${recordToDelete.attendee.name}" removed successfully. The attendee status is reset to Not Attended.`,
        });
        setRecordToDelete(null);
        setSelectedRecord(null);
        fetchRecords(searchRef.current);
      } else {
        setActionFeedback({
          type: 'error',
          message: data.error || 'Failed to remove attendance record.',
        });
      }
    } catch (e: any) {
      setActionFeedback({
        type: 'error',
        message: e.message || 'Network error while removing attendance.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142D4E]">Attendance Records</h1>
          <p className="text-xs text-[#667085] mt-1">
            Real-time feed of authenticated check-in timestamps and verified attendee photographs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={forceCacheClear}
            className="flex items-center gap-1.5"
            disabled={isLoading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Records</span>
          </Button>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between animate-fadeIn ${
            actionFeedback.type === 'success'
              ? 'bg-[#16835D]/10 border-[#16835D]/30 text-[#16835D]'
              : 'bg-[#C0393A]/10 border-[#C0393A]/30 text-[#C0393A]'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="p-1 hover:bg-black/5 rounded text-current"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Controls Card: Search & Filters */}
      <Card>
        <CardContent className="p-4 space-y-4 md:space-y-0 md:flex md:items-center md:justify-between gap-4">
          {/* Real-time Debounced Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md flex items-center">
            <Search className="w-4 h-4 absolute left-3 top-3 text-[#667085]" />
            <input
              type="text"
              placeholder="Search by student name or college (instant filter)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg text-xs text-[#182230] placeholder-[#667085] focus:outline-none focus:border-[#2864B4] focus:ring-1 focus:ring-[#2864B4]"
            />
            {search && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-2.5 text-[#667085] hover:text-[#182230]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>

        </CardContent>
      </Card>

      {/* Main Records Table Card */}
      <Card>
        <CardHeader className="border-b border-[#E4E9F0] pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-[#142D4E]">
              Confirmed Student Check-Ins ({totalCount})
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-[#667085]">
              <ShieldCheck className="w-4 h-4 text-[#16835D]" />
              <span>Camera Verified Logs</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E4E9F0] bg-[#F7F9FC] text-[#667085] font-semibold">
                  <th className="px-6 py-3 w-16">Photo</th>
                  <th className="px-6 py-3">Student Name</th>
                  <th className="px-6 py-3">College</th>
                  <th className="px-6 py-3">Check-In Time</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E9F0]">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-[#667085]">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#2864B4]" />
                      Loading verified records...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-[#667085]">
                      No attendance check-ins found matching your search.
                    </td>
                  </tr>
                ) : (
                  records.map((r: any) => (
                    <tr key={r.id} className="hover:bg-[#F7F9FC]/70 transition-colors">
                      {/* Photo Thumbnail */}
                      <td className="px-6 py-3">
                        {r.photo?.signed_url && !failedImages[r.id] ? (
                          <div className="w-10 h-10 rounded-md overflow-hidden bg-[#EEF1F5] border border-[#CBD5E1]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={r.photo.signed_url}
                              alt={r.attendee.name}
                              className="w-full h-full object-cover"
                              onError={() =>
                                setFailedImages((prev) => ({ ...prev, [r.id]: true }))
                              }
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-md bg-[#EEF1F5] flex items-center justify-center text-[#667085] border border-[#E4E9F0]">
                            <Camera className="w-4 h-4" />
                          </div>
                        )}
                      </td>

                      {/* Attendee Name */}
                      <td className="px-6 py-3 font-bold text-[#182230]">
                        {r.attendee.name}
                      </td>

                      {/* College */}
                      <td className="px-6 py-3 text-[#182230]">
                        {r.attendee.college || r.attendee.identifier || '—'}
                      </td>

                      {/* Time */}
                      <td className="px-6 py-3 text-[#667085]">
                        {new Date(r.captured_at_device).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-3">
                        <Badge variant="success">Confirmed</Badge>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedRecord(r)}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" /> View Details
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRecordToDelete(r)}
                            className="border-[#C0393A]/30 text-[#C0393A] hover:bg-[#C0393A]/10 hover:border-[#C0393A]"
                            title="Remove attendance and photo (Attendee data remains safe)"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1 text-[#C0393A]" /> Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-6 py-3 border-t border-[#E4E9F0] flex items-center justify-between text-xs text-[#667085]">
            <span>
              Showing {records.length} of {totalCount} records
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </Button>
              <span className="font-medium text-[#182230]">
                Page {page} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details & Photo Modal */}
      {selectedRecord && (
        <Modal
          isOpen={!!selectedRecord}
          onClose={() => setSelectedRecord(null)}
          title="Verified Attendance Record"
          maxWidth="md"
        >
          <div className="space-y-4">
            {/* Captured Photograph */}
            <div className="flex flex-col items-center">
              {selectedRecord.photo?.signed_url && !failedImages[selectedRecord.id] ? (
                <div className="relative w-64 h-64 rounded-xl overflow-hidden border-2 border-[#142D4E] shadow-sm bg-[#EEF1F5] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedRecord.photo.signed_url}
                    alt={selectedRecord.attendee.name}
                    className="w-full h-full object-cover"
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [selectedRecord.id]: true }))
                    }
                  />
                </div>
              ) : (
                <div className="w-64 h-64 rounded-xl bg-[#EEF1F5] flex flex-col items-center justify-center text-[#667085] border border-[#CBD5E1]">
                  <Camera className="w-8 h-8 mb-2" />
                  <span className="text-xs">Photograph awaiting sync or processing</span>
                </div>
              )}
            </div>

            {/* Details Grid */}
            <div className="bg-[#F7F9FC] border border-[#E4E9F0] rounded-xl p-4 space-y-3 text-xs">
              <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                <span className="text-[#667085]">Student Name:</span>
                <span className="font-bold text-[#182230]">{selectedRecord.attendee.name}</span>
              </div>
              <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                <span className="text-[#667085]">College Name:</span>
                <span className="font-semibold text-[#182230]">
                  {selectedRecord.attendee.college || selectedRecord.attendee.identifier || '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                <span className="text-[#667085]">Device Capture Timestamp:</span>
                <span className="font-mono text-[#182230]">
                  {new Date(selectedRecord.captured_at_device).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                <span className="text-[#667085]">Server Receipt Timestamp:</span>
                <span className="font-mono text-[#182230]">
                  {new Date(selectedRecord.received_at_server).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                <span className="text-[#667085]">Attendance Session:</span>
                <span className="text-[#182230]">{selectedRecord.session_name}</span>
              </div>

              {/* Render Extra Uploaded Columns/Details */}
              {selectedRecord.attendee.extra_details &&
                Object.keys(selectedRecord.attendee.extra_details).length > 0 && (
                  <div className="border-b border-[#E4E9F0] pb-2 pt-1 space-y-1.5">
                    <span className="text-[11px] font-bold text-[#142D4E] block uppercase tracking-wider">
                      Additional Details:
                    </span>
                    {Object.entries(selectedRecord.attendee.extra_details).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-[#667085]">{k}:</span>
                        <span className="font-semibold text-[#182230]">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}

              <div className="flex justify-between">
                <span className="text-[#667085]">Client Operation ID:</span>
                <span className="font-mono text-[10px] text-[#667085]">
                  {selectedRecord.operation_id}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rec = selectedRecord;
                  setSelectedRecord(null);
                  setRecordToDelete(rec);
                }}
                className="border-[#C0393A]/30 text-[#C0393A] hover:bg-[#C0393A]/10 hover:border-[#C0393A]"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5 text-[#C0393A]" /> Remove This Attendance
              </Button>

              <Button variant="primary" size="sm" onClick={() => setSelectedRecord(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal for Removing Attendance */}
      {recordToDelete && (
        <Modal
          isOpen={!!recordToDelete}
          onClose={() => !isDeleting && setRecordToDelete(null)}
          title="Confirm Attendance Removal"
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-[#C0393A]/10 border border-[#C0393A]/20 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#C0393A] shrink-0 mt-0.5" />
              <div className="text-xs text-[#182230] space-y-1">
                <p className="font-bold text-sm text-[#C0393A]">
                  Remove attendance for &ldquo;{recordToDelete.attendee.name}&rdquo;?
                </p>
                <p className="text-[#667085]">
                  This will delete the attendance log, capture timestamp, and verified photograph.
                </p>
                <p className="text-[#16835D] font-semibold">
                  ✓ Safe Action: The student will NOT be deleted. Their registration remains completely safe in the database and their status will revert to &ldquo;Not Attended / Pending&rdquo;.
                </p>
              </div>
            </div>

            <div className="p-3 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#667085]">Student Name:</span>
                <span className="font-bold text-[#142D4E]">{recordToDelete.attendee.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667085]">College:</span>
                <span className="text-[#182230]">
                  {recordToDelete.attendee.college || recordToDelete.attendee.identifier || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667085]">Recorded Timestamp:</span>
                <span className="font-mono text-[#182230]">
                  {new Date(recordToDelete.captured_at_device).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isDeleting}
                onClick={() => setRecordToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={isDeleting}
                onClick={handleDeleteAttendance}
                className="bg-[#C0393A] hover:bg-[#A82D2E] text-white font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Confirm Remove Attendance
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
