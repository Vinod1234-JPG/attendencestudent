'use client';

import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { maskIdentifier } from '@/lib/utils/normalization';

export default function AttendanceRecordsPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Selected record for details modal
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '15',
        search: search.trim(),
        category,
      });

      const res = await fetch(`/api/attendance?${params.toString()}`);
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
    fetchRecords();
  }, [page, category]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchRecords();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142D4E]">Attendance Records</h1>
          <p className="text-xs text-[#667085] mt-1">
            Browse and inspect verified kiosk check-ins and attendance photographs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchRecords} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh List
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-[#667085]" />
            <input
              type="text"
              placeholder="Search by attendee name, email, or PhD ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-[#E4E9F0] focus:outline-none focus:ring-1 focus:ring-[#2864B4]"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs rounded-md border border-[#E4E9F0] bg-white text-[#182230] focus:outline-none focus:ring-1 focus:ring-[#2864B4]"
            >
              <option value="">All Categories</option>
              <option value="guide">Guides</option>
              <option value="phd_scholar">PhD Scholars</option>
            </select>

            <Button type="submit" variant="primary" size="sm">
              Search
            </Button>
          </div>
        </form>
      </Card>

      {/* Records Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] text-[#667085] border-b border-[#E4E9F0]">
                <tr>
                  <th className="px-6 py-3 font-semibold">Photo</th>
                  <th className="px-6 py-3 font-semibold">Attendee Name</th>
                  <th className="px-6 py-3 font-semibold">Category</th>
                  <th className="px-6 py-3 font-semibold">Masked Identifier</th>
                  <th className="px-6 py-3 font-semibold">Check-In Time</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E9F0]">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-[#667085]">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#2864B4]" />
                      Loading verified records...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-[#667085]">
                      No attendance check-ins found matching your search.
                    </td>
                  </tr>
                ) : (
                  records.map((r: any) => (
                    <tr key={r.id} className="hover:bg-[#F7F9FC]/70 transition-colors">
                      {/* Photo Thumbnail */}
                      <td className="px-6 py-3">
                        {r.photo?.signed_url ? (
                          <div className="w-10 h-10 rounded-md overflow-hidden bg-black border border-[#CBD5E1]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={r.photo.signed_url}
                              alt={r.attendee.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-md bg-[#EEF1F5] flex items-center justify-center text-[#667085]">
                            <Camera className="w-4 h-4" />
                          </div>
                        )}
                      </td>

                      {/* Attendee Name */}
                      <td className="px-6 py-3 font-bold text-[#182230]">
                        {r.attendee.name}
                      </td>

                      {/* Category */}
                      <td className="px-6 py-3">
                        <Badge variant="blue">
                          {r.attendee.category === 'guide' ? 'Guide' : 'PhD Scholar'}
                        </Badge>
                      </td>

                      {/* Masked Identifier */}
                      <td className="px-6 py-3 font-mono text-[#667085]">
                        {maskIdentifier(r.attendee.identifier, r.attendee.category)}
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

                      {/* Action */}
                      <td className="px-6 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedRecord(r)}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" /> View Details
                        </Button>
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

      {/* Record Details Modal */}
      {selectedRecord && (
        <Modal
          isOpen={!!selectedRecord}
          onClose={() => setSelectedRecord(null)}
          title="Attendance Record Details"
          maxWidth="lg"
        >
          <div className="space-y-6">
            {/* Photo Section */}
            <div className="flex justify-center">
              {selectedRecord.photo?.signed_url ? (
                <div className="relative w-64 h-64 rounded-xl overflow-hidden border-2 border-[#142D4E] shadow-sm bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedRecord.photo.signed_url}
                    alt={selectedRecord.attendee.name}
                    className="w-full h-full object-cover"
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
                <span className="text-[#667085]">Full Name:</span>
                <span className="font-bold text-[#182230]">{selectedRecord.attendee.name}</span>
              </div>
              <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                <span className="text-[#667085]">Attendee Category:</span>
                <span className="font-semibold text-[#142D4E] capitalize">
                  {selectedRecord.attendee.category === 'guide' ? 'Guide' : 'PhD Scholar'}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                <span className="text-[#667085]">
                  {selectedRecord.attendee.category === 'guide' ? 'Registered Email:' : 'PhD ID:'}
                </span>
                <span className="font-mono font-semibold text-[#182230]">
                  {selectedRecord.attendee.identifier}
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
                      Additional Uploaded Details:
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

            <div className="flex justify-end">
              <Button variant="primary" size="md" onClick={() => setSelectedRecord(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
