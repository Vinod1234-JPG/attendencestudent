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
  X
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142D4E]">All Registered Attendees</h1>
          <p className="text-xs text-[#667085] mt-1">
            Complete registry of Research Guides and PhD Scholars with their names, registered email addresses, and check-in status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/import">
            <Button variant="outline" size="sm">
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload More Data
            </Button>
          </Link>
          <Button variant="primary" size="sm" onClick={() => fetchAttendees(searchRef.current)} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh Registry
          </Button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="p-4 bg-white border border-[#E4E9F0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#EAF2FC] flex items-center justify-center text-[#2864B4]">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider">Total Registered</p>
              <p className="text-xl font-bold text-[#142D4E]">{counts.total}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-white border border-[#E4E9F0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#EAF2FC] flex items-center justify-center text-[#2864B4]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider">Guides</p>
              <p className="text-xl font-bold text-[#142D4E]">{counts.guides}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-white border border-[#E4E9F0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FEF3F2] flex items-center justify-center text-[#B42318]">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider">PhD Scholars</p>
              <p className="text-xl font-bold text-[#142D4E]">{counts.scholars}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-white border border-[#E4E9F0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#ECFDF3] flex items-center justify-center text-[#027A48]">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider">Attended</p>
              <p className="text-xl font-bold text-[#027A48]">{counts.attended}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-white border border-[#E4E9F0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FFFAEB] flex items-center justify-center text-[#B54708]">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider">Pending</p>
              <p className="text-xl font-bold text-[#B54708]">{counts.pending}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-[#667085]" />
            <input
              type="text"
              placeholder="Search by attendee name, email address, or PhD ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2 text-xs rounded-md border border-[#E4E9F0] focus:outline-none focus:ring-1 focus:ring-[#2864B4]"
            />
            {search && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-2.5 text-[#98A2B3] hover:text-[#182230]"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-md border border-[#E4E9F0] bg-white text-[#182230] focus:outline-none focus:ring-1 focus:ring-[#2864B4]"
            >
              <option value="all">All Categories ({counts.total})</option>
              <option value="guide">Research Guides ({counts.guides})</option>
              <option value="phd_scholar">PhD Scholars ({counts.scholars})</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-md border border-[#E4E9F0] bg-white text-[#182230] focus:outline-none focus:ring-1 focus:ring-[#2864B4]"
            >
              <option value="all">All Statuses</option>
              <option value="attended">Attended ({counts.attended})</option>
              <option value="pending">Pending ({counts.pending})</option>
            </select>

            <Button type="submit" variant="primary" size="sm">
              Search
            </Button>
          </div>
        </form>
      </Card>

      {/* Attendees Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] text-[#667085] border-b border-[#E4E9F0]">
                <tr>
                  <th className="px-6 py-3 font-semibold">Attendee Name</th>
                  <th className="px-6 py-3 font-semibold">Category</th>
                  <th className="px-6 py-3 font-semibold">Email Address / Identifier</th>
                  <th className="px-6 py-3 font-semibold">Department / Affiliation</th>
                  <th className="px-6 py-3 font-semibold">Attendance Status</th>
                  <th className="px-6 py-3 font-semibold">Photo</th>
                  <th className="px-6 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E9F0]">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-[#667085]">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#2864B4]" />
                      Loading registered attendee directory...
                    </td>
                  </tr>
                ) : attendees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-[#667085]">
                      No registered attendees found matching your criteria.
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
                          {attendee.category === 'guide' ? 'Research Guide' : 'PhD Scholar'}
                        </Badge>
                      </td>

                      {/* Email / Identifier */}
                      <td className="px-6 py-3.5 font-mono text-[#142D4E]">
                        {attendee.email ? (
                          <span className="flex items-center gap-1.5 font-medium">
                            <Mail className="w-3.5 h-3.5 text-[#2864B4]" />
                            {attendee.email}
                          </span>
                        ) : attendee.phd_id ? (
                          <span className="flex items-center gap-1.5 font-semibold text-[#182230]">
                            <Award className="w-3.5 h-3.5 text-[#D97706]" />
                            ID: {attendee.phd_id}
                          </span>
                        ) : (
                          <span className="text-[#94A3B8] italic">Not provided</span>
                        )}
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

                      {/* Action */}
                      <td className="px-6 py-3.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedAttendee(attendee)}
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
                    <span className="text-[#16835D]">Attended ({new Date(selectedAttendee.attended_at!).toLocaleString()})</span>
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

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelectedAttendee(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
