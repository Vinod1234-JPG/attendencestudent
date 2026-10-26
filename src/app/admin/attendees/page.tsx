'use client';

import React, { useState, useEffect } from 'react';
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
  Award
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
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);

  const fetchAttendees = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        category: categoryFilter,
        status: statusFilter,
        search: search.trim(),
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
    fetchAttendees();
  }, [categoryFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAttendees();
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
          <Button variant="primary" size="sm" onClick={fetchAttendees} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh Registry
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4 bg-white border border-[#E4E9F0]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#667085] font-medium">Total Registered</span>
            <Users className="w-4 h-4 text-[#2864B4]" />
          </div>
          <div className="text-2xl font-extrabold text-[#142D4E] mt-1">{counts.total}</div>
          <span className="text-[11px] text-[#667085]">All Categories</span>
        </Card>

        <Card className="p-4 bg-white border border-[#E4E9F0]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#667085] font-medium">Research Guides</span>
            <BookOpen className="w-4 h-4 text-[#2864B4]" />
          </div>
          <div className="text-2xl font-extrabold text-[#142D4E] mt-1">{counts.guides}</div>
          <span className="text-[11px] text-[#667085]">Guides Registered</span>
        </Card>

        <Card className="p-4 bg-white border border-[#E4E9F0]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#667085] font-medium">PhD Scholars</span>
            <GraduationCap className="w-4 h-4 text-[#2864B4]" />
          </div>
          <div className="text-2xl font-extrabold text-[#142D4E] mt-1">{counts.scholars}</div>
          <span className="text-[11px] text-[#667085]">Scholars Registered</span>
        </Card>

        <Card className="p-4 bg-white border border-[#E4E9F0]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#667085] font-medium">Attended at Kiosk</span>
            <CheckCircle2 className="w-4 h-4 text-[#16835D]" />
          </div>
          <div className="text-2xl font-extrabold text-[#16835D] mt-1">{counts.attended}</div>
          <span className="text-[11px] text-[#16835D] font-medium">
            {counts.total > 0 ? Math.round((counts.attended / counts.total) * 100) : 0}% Check-in Rate
          </span>
        </Card>

        <Card className="p-4 bg-white border border-[#E4E9F0]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#667085] font-medium">Pending Arrival</span>
            <Clock className="w-4 h-4 text-[#D97706]" />
          </div>
          <div className="text-2xl font-extrabold text-[#D97706] mt-1">{counts.pending}</div>
          <span className="text-[11px] text-[#667085]">Awaiting Check-In</span>
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
              className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-[#E4E9F0] focus:outline-none focus:ring-1 focus:ring-[#2864B4]"
            />
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
