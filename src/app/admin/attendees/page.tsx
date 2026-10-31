'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Users,
  GraduationCap,
  BookOpen,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  RefreshCw,
  Upload,
  Mail,
  Camera,
  Eye,
  Shield,
  Award,
  X,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';

interface Attendee {
  id: string;
  name: string;
  category: 'guide' | 'phd_scholar';
  email: string | null;
  phd_id: string | null;
  metadata: Record<string, any>;
  attended: boolean;
  attended_at: string | null;
  photo_url: string | null;
}

export default function RegisteredAttendeesPage() {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    guides: 0,
    scholars: 0,
    attended: 0,
    pending: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const searchRef = useRef('');
  searchRef.current = debouncedSearch;

  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);

  // Revoke attendance modal states
  const [revokeConfirmAttendee, setRevokeConfirmAttendee] = useState<Attendee | null>(null);
  const [isRevoking, setIsRevoking] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Auto-debounce search as user types after 250ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchAttendees = async (term = searchRef.current) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        category: categoryFilter,
        status: statusFilter,
        search: (term ?? '').trim(),
        _t: Date.now().toString(),
      });

      const res = await fetch(`/api/admin/attendees?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setAttendees(data.attendees || []);
        if (data.counts) {
          setCounts(data.counts);
        }
      }
    } catch (e) {
      console.warn('Failed to load registered attendees:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendees(debouncedSearch);

    // Auto-refresh when tab gains focus or every 10 seconds for real-time live events
    const onFocus = () => fetchAttendees(searchRef.current);
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => fetchAttendees(searchRef.current), 10000);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [categoryFilter, statusFilter, debouncedSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search);
    fetchAttendees(search);
  };

  const handleClearSearch = () => {
    setSearch('');
    setDebouncedSearch('');
    fetchAttendees('');
  };

  // Safe removal of attendance record only (preserves person in `people` table)
  const handleRevokeAttendance = async () => {
    if (!revokeConfirmAttendee) return;
    setIsRevoking(true);
    setActionFeedback(null);

    try {
      const res = await fetch(`/api/attendance?person_id=${encodeURIComponent(revokeConfirmAttendee.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setActionFeedback({
          type: 'success',
          message: `Attendance for "${revokeConfirmAttendee.name}" removed successfully. Status reset to Pending.`,
        });
        setRevokeConfirmAttendee(null);
        setSelectedAttendee(null);
        fetchAttendees(searchRef.current);
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
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142D4E]">Registered Attendees</h1>
          <p className="text-xs text-[#667085] mt-1">
            Directory of Guides and PhD Scholars enrolled for the MRF Research Retreat.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/admin/import">
            <Button variant="primary" size="sm" className="flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              <span>Import Attendees</span>
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAttendees(searchRef.current)}
            className="flex items-center gap-1.5"
            disabled={isLoading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-4 bg-white">
          <p className="text-[11px] font-semibold text-[#667085]">Total Registered</p>
          <p className="text-2xl font-black text-[#142D4E] mt-1">{counts.total}</p>
        </Card>
        <Card className="p-4 bg-white">
          <p className="text-[11px] font-semibold text-[#667085] flex items-center gap-1">
            <BookOpen className="w-3 h-3 text-[#2864B4]" /> Guides
          </p>
          <p className="text-2xl font-black text-[#2864B4] mt-1">{counts.guides}</p>
        </Card>
        <Card className="p-4 bg-white">
          <p className="text-[11px] font-semibold text-[#667085] flex items-center gap-1">
            <GraduationCap className="w-3 h-3 text-[#E65100]" /> PhD Scholars
          </p>
          <p className="text-2xl font-black text-[#E65100] mt-1">{counts.scholars}</p>
        </Card>
        <Card className="p-4 bg-white border-l-4 border-l-[#16835D]">
          <p className="text-[11px] font-semibold text-[#667085] flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-[#16835D]" /> Attended
          </p>
          <p className="text-2xl font-black text-[#16835D] mt-1">{counts.attended}</p>
        </Card>
        <Card className="p-4 bg-white border-l-4 border-l-[#D97706]">
          <p className="text-[11px] font-semibold text-[#667085] flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#D97706]" /> Pending Check-in
          </p>
          <p className="text-2xl font-black text-[#D97706] mt-1">{counts.pending}</p>
        </Card>
      </div>

      {/* Filters and Search Bar */}
      <Card>
        <CardContent className="p-4 space-y-4 md:space-y-0 md:flex md:items-center md:justify-between gap-4">
          {/* Real-time Debounced Search */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md flex items-center">
            <Search className="w-4 h-4 absolute left-3 top-3 text-[#667085]" />
            <input
              type="text"
              placeholder="Search by name, email, or PhD ID (instant filter)..."
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

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Category Filter */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-[#667085] font-medium mr-1">Category:</span>
              <div className="inline-flex p-1 bg-[#EEF1F5] rounded-lg border border-[#E4E9F0]">
                {['all', 'guide', 'phd_scholar'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md capitalize transition-all ${
                      categoryFilter === cat
                        ? 'bg-white text-[#142D4E] shadow-2xs'
                        : 'text-[#667085] hover:text-[#182230]'
                    }`}
                  >
                    {cat === 'all' ? 'All' : cat === 'guide' ? 'Guides' : 'Scholars'}
                  </button>
                ))}
              </div>
            </div>

            {/* Attendance Status Filter */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-[#667085] font-medium mr-1">Status:</span>
              <div className="inline-flex p-1 bg-[#EEF1F5] rounded-lg border border-[#E4E9F0]">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'attended', label: 'Attended' },
                  { key: 'pending', label: 'Pending' },
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStatusFilter(s.key)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      statusFilter === s.key
                        ? 'bg-white text-[#142D4E] shadow-2xs'
                        : 'text-[#667085] hover:text-[#182230]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendees Table */}
      <Card>
        <CardHeader className="border-b border-[#E4E9F0] pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-[#142D4E]">
              Registered Enrolment Roster ({attendees.length})
            </CardTitle>
            <span className="text-xs text-[#667085]">
              Active Event: <strong>MRF Research Retreat</strong>
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E4E9F0] bg-[#F7F9FC] text-[#667085] font-semibold">
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Registered Email / PhD ID</th>
                  <th className="px-6 py-3.5">Department / College</th>
                  <th className="px-6 py-3.5">Attendance</th>
                  <th className="px-6 py-3.5">Photo</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E9F0]">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-[#667085]">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#2864B4]" />
                      Loading attendee records...
                    </td>
                  </tr>
                ) : attendees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-[#667085]">
                      No registered attendees match the current filters or search term.
                    </td>
                  </tr>
                ) : (
                  attendees.map((attendee) => (
                    <tr key={attendee.id} className="hover:bg-[#F7F9FC]/70 transition-colors">
                      {/* Name */}
                      <td className="px-6 py-3.5 font-bold text-[#182230]">
                        {attendee.name}
                      </td>

                      {/* Category */}
                      <td className="px-6 py-3.5">
                        <Badge variant="blue">
                          {attendee.category === 'guide' ? 'Guide' : 'PhD Scholar'}
                        </Badge>
                      </td>

                      {/* Email / PhD ID */}
                      <td className="px-6 py-3.5 text-[#182230]">
                        <div className="space-y-0.5">
                          {attendee.category === 'guide' ? (
                            <div className="flex items-center gap-1.5 font-medium text-[#142D4E]">
                              <Mail className="w-3.5 h-3.5 text-[#2864B4] shrink-0" />
                              <span>{attendee.email || '—'}</span>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              {attendee.phd_id && (
                                <div className="flex items-center gap-1.5 font-mono font-semibold text-[#142D4E]">
                                  <Award className="w-3.5 h-3.5 text-[#E65100] shrink-0" />
                                  <span>ID: {attendee.phd_id}</span>
                                </div>
                              )}
                              {attendee.email && (
                                <div className="flex items-center gap-1 text-[11px] text-[#667085]">
                                  <Mail className="w-3 h-3 text-[#667085] shrink-0" />
                                  <span>{attendee.email}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Department / Metadata */}
                      <td className="px-6 py-3.5 text-[#667085]">
                        {attendee.metadata?.Department ||
                          attendee.metadata?.Institution ||
                          attendee.metadata?.Topic ||
                          attendee.metadata?.Guide ||
                          '—'}
                      </td>

                      {/* Attendance Status */}
                      <td className="px-6 py-3.5">
                        {attendee.attended ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#16835D] bg-[#16835D]/10 px-2 py-0.5 rounded-full border border-[#16835D]/20">
                            <CheckCircle2 className="w-3 h-3" /> Attended
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#D97706] bg-[#D97706]/10 px-2 py-0.5 rounded-full border border-[#D97706]/20">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </td>

                      {/* Photo */}
                      <td className="px-6 py-3.5">
                        {attendee.photo_url ? (
                          <div className="w-9 h-9 rounded-md overflow-hidden bg-[#EEF1F5] border border-[#CBD5E1]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={attendee.photo_url}
                              alt={attendee.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-9 h-9 rounded-md bg-[#EEF1F5] flex items-center justify-center text-[#94A3B8] border border-[#E4E9F0]">
                            <Camera className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedAttendee(attendee)}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" /> View Details
                          </Button>
                          {attendee.attended && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setRevokeConfirmAttendee(attendee)}
                              className="border-[#C0393A]/30 text-[#C0393A] hover:bg-[#C0393A]/10 hover:border-[#C0393A]"
                              title="Remove attendance and photo (Attendee remains safely in registry)"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1 text-[#C0393A]" /> Revoke
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Count */}
          <div className="px-6 py-3 border-t border-[#E4E9F0] text-xs text-[#667085]">
            Showing {attendees.length} of {counts.total} registered attendees
          </div>
        </CardContent>
      </Card>

      {/* Details Modal */}
      {selectedAttendee && (
        <Modal
          isOpen={!!selectedAttendee}
          onClose={() => setSelectedAttendee(null)}
          title="Attendee Profile & Check-in Details"
          maxWidth="lg"
        >
          <div className="space-y-6">
            {/* Photo Section */}
            {selectedAttendee.photo_url && (
              <div className="flex justify-center">
                <div className="relative w-48 h-48 rounded-xl overflow-hidden border-2 border-[#142D4E] shadow-sm bg-[#EEF1F5]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedAttendee.photo_url}
                    alt={selectedAttendee.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            {/* Profile Grid */}
            <div className="bg-[#F7F9FC] border border-[#E4E9F0] rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                <span className="text-[#667085]">Full Name:</span>
                <span className="font-bold text-[#182230]">{selectedAttendee.name}</span>
              </div>
              <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                <span className="text-[#667085]">Category:</span>
                <span className="font-semibold text-[#142D4E] capitalize">
                  {selectedAttendee.category === 'guide' ? 'Research Guide' : 'PhD Scholar'}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                <span className="text-[#667085]">Registered Email:</span>
                <span className="font-mono font-semibold text-[#182230]">
                  {selectedAttendee.email || 'None'}
                </span>
              </div>
              {selectedAttendee.phd_id && (
                <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                  <span className="text-[#667085]">Official PhD ID:</span>
                  <span className="font-mono font-semibold text-[#182230]">
                    {selectedAttendee.phd_id}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-b border-[#E4E9F0] pb-2">
                <span className="text-[#667085]">Attendance Status:</span>
                <span className="font-semibold">
                  {selectedAttendee.attended ? (
                    <span className="text-[#16835D]">
                      Attended ({new Date(selectedAttendee.attended_at!).toLocaleString()})
                    </span>
                  ) : (
                    <span className="text-[#D97706]">Awaiting Check-in</span>
                  )}
                </span>
              </div>

              {/* Extra Metadata Columns */}
              {selectedAttendee.metadata && Object.keys(selectedAttendee.metadata).length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <span className="text-[11px] font-bold text-[#142D4E] uppercase tracking-wider block">
                    Additional Uploaded Details:
                  </span>
                  {Object.entries(selectedAttendee.metadata).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-[#667085]">{k}:</span>
                      <span className="font-semibold text-[#182230]">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              {selectedAttendee.attended ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const att = selectedAttendee;
                    setSelectedAttendee(null);
                    setRevokeConfirmAttendee(att);
                  }}
                  className="border-[#C0393A]/30 text-[#C0393A] hover:bg-[#C0393A]/10 hover:border-[#C0393A]"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5 text-[#C0393A]" /> Revoke Attendance (Reset to Pending)
                </Button>
              ) : (
                <div />
              )}

              <Button variant="outline" size="sm" onClick={() => setSelectedAttendee(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal for Revoking Attendance */}
      {revokeConfirmAttendee && (
        <Modal
          isOpen={!!revokeConfirmAttendee}
          onClose={() => !isRevoking && setRevokeConfirmAttendee(null)}
          title="Confirm Revoke Attendance"
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-[#C0393A]/10 border border-[#C0393A]/20 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#C0393A] shrink-0 mt-0.5" />
              <div className="text-xs text-[#182230] space-y-1">
                <p className="font-bold text-sm text-[#C0393A]">
                  Remove attendance for &ldquo;{revokeConfirmAttendee.name}&rdquo;?
                </p>
                <p className="text-[#667085]">
                  This will delete the attendance record, check-in timestamp, and captured photograph.
                </p>
                <p className="text-[#16835D] font-semibold">
                  ✓ Safe Action: The registered person will NOT be deleted. Their profile and enrollment details remain safely in the registry and their status will revert to &ldquo;Pending&rdquo;.
                </p>
              </div>
            </div>

            <div className="p-3 bg-[#F7F9FC] border border-[#E4E9F0] rounded-lg text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#667085]">Attendee Name:</span>
                <span className="font-bold text-[#142D4E]">{revokeConfirmAttendee.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667085]">Category:</span>
                <span className="capitalize font-semibold text-[#182230]">
                  {revokeConfirmAttendee.category === 'guide' ? 'Research Guide' : 'PhD Scholar'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667085]">Identifier:</span>
                <span className="font-mono text-[#182230]">
                  {revokeConfirmAttendee.email || revokeConfirmAttendee.phd_id || '—'}
                </span>
              </div>
              {revokeConfirmAttendee.attended_at && (
                <div className="flex justify-between">
                  <span className="text-[#667085]">Recorded Check-In:</span>
                  <span className="font-mono text-[#182230]">
                    {new Date(revokeConfirmAttendee.attended_at).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isRevoking}
                onClick={() => setRevokeConfirmAttendee(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={isRevoking}
                onClick={handleRevokeAttendance}
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
