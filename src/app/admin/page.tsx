'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  GraduationCap,
  BookOpen,
  CheckCircle2,
  Clock,
  Percent,
  Upload,
  ArrowRight,
  RefreshCw,
  Camera,
  AlertCircle
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { maskIdentifier } from '@/lib/utils/normalization';

interface DashboardStats {
  totalGuidesRegistered: number;
  totalScholarsRegistered: number;
  totalRegistered: number;
  guidesAttended: number;
  scholarsAttended: number;
  totalAttended: number;
  pendingAttendees: number;
  attendancePercentage: number;
  recentAttendance: any[];
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalGuidesRegistered: 0,
    totalScholarsRegistered: 0,
    totalRegistered: 0,
    guidesAttended: 0,
    scholarsAttended: 0,
    totalAttended: 0,
    pendingAttendees: 0,
    attendancePercentage: 0,
    recentAttendance: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      // Fetch attendance records and registered people counts
      const res = await fetch(`/api/attendance?limit=5&_t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await res.json();

      const prepRes = await fetch(`/api/kiosk/prep-offline?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      const prepData = await prepRes.json();

      const totalGuides = prepData.counts?.guides || 0;
      const totalScholars = prepData.counts?.scholars || 0;
      const totalReg = totalGuides + totalScholars;

      const totalAttended = data.pagination?.total || 0;
      const recent = data.records || [];

      // Calculate category attended counts from recent or full data
      const guidesAttended = recent.filter((r: any) => r.attendee?.category === 'guide').length;
      const scholarsAttended = recent.filter((r: any) => r.attendee?.category === 'phd_scholar').length;

      const pending = Math.max(0, totalReg - totalAttended);
      const pct = totalReg > 0 ? Math.round((totalAttended / totalReg) * 100) : 0;

      setStats({
        totalGuidesRegistered: totalGuides,
        totalScholarsRegistered: totalScholars,
        totalRegistered: totalReg,
        guidesAttended: guidesAttended,
        scholarsAttended: scholarsAttended,
        totalAttended: totalAttended,
        pendingAttendees: pending,
        attendancePercentage: pct,
        recentAttendance: recent,
      });
    } catch (e) {
      console.warn('Dashboard fetch error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-[#E4E9F0] shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142D4E]">Attendance Operations Dashboard</h1>
          <p className="text-xs text-[#667085] mt-1">
            Real-time monitoring for Maharaja Research Foundation Event Attendance Session.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchStats} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Link href="/kiosk" target="_blank">
            <Button variant="primary" size="sm">
              Open Live Kiosk <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Empty State when no people registered */}
      {!isLoading && stats.totalRegistered === 0 && (
        <div className="p-8 bg-white border border-[#E4E9F0] rounded-xl text-center">
          <div className="w-12 h-12 bg-[#EAF2FC] text-[#2864B4] rounded-full flex items-center justify-center mx-auto mb-3">
            <Upload className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-[#142D4E]">No MRF Attendee Records Found</h3>
          <p className="text-xs text-[#667085] max-w-md mx-auto mt-1 mb-4">
            Before attendees can check in at the kiosk, you must import the registered Guides and PhD Scholars list.
          </p>
          <Link href="/admin/import">
            <Button variant="primary" size="md">
              <Upload className="w-4 h-4 mr-2" /> Upload MRF Data
            </Button>
          </Link>
        </div>
      )}

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#667085]">Total Registered</span>
              <Users className="w-4 h-4 text-[#2864B4]" />
            </div>
            <p className="text-2xl font-bold text-[#142D4E] mt-2">{stats.totalRegistered}</p>
            <p className="text-[11px] text-[#667085] mt-1">
              {stats.totalGuidesRegistered} Guides • {stats.totalScholarsRegistered} Scholars
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#667085]">Total Attended</span>
              <CheckCircle2 className="w-4 h-4 text-[#16835D]" />
            </div>
            <p className="text-2xl font-bold text-[#16835D] mt-2">{stats.totalAttended}</p>
            <p className="text-[11px] text-[#667085] mt-1">
              Verified with photograph
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#667085]">Pending Attendees</span>
              <Clock className="w-4 h-4 text-[#B7791F]" />
            </div>
            <p className="text-2xl font-bold text-[#B7791F] mt-2">{stats.pendingAttendees}</p>
            <p className="text-[11px] text-[#667085] mt-1">
              Awaiting arrival
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#667085]">Attendance Rate</span>
              <Percent className="w-4 h-4 text-[#2864B4]" />
            </div>
            <p className="text-2xl font-bold text-[#142D4E] mt-2">{stats.attendancePercentage}%</p>
            <div className="w-full bg-[#EEF1F5] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-[#2864B4] h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, stats.attendancePercentage)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Attendance Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#2864B4]" /> Guides Attendance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#667085]">Registered Guides:</span>
              <span className="font-bold text-[#182230]">{stats.totalGuidesRegistered}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#667085]">Attended at Kiosk:</span>
              <span className="font-bold text-[#16835D]">{stats.guidesAttended}</span>
            </div>
            <div className="w-full bg-[#EEF1F5] h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#2864B4] h-full rounded-full"
                style={{
                  width: `${
                    stats.totalGuidesRegistered > 0
                      ? Math.min(100, (stats.guidesAttended / stats.totalGuidesRegistered) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[#2864B4]" /> PhD Scholars Attendance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#667085]">Registered Scholars:</span>
              <span className="font-bold text-[#182230]">{stats.totalScholarsRegistered}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#667085]">Attended at Kiosk:</span>
              <span className="font-bold text-[#16835D]">{stats.scholarsAttended}</span>
            </div>
            <div className="w-full bg-[#EEF1F5] h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#2864B4] h-full rounded-full"
                style={{
                  width: `${
                    stats.totalScholarsRegistered > 0
                      ? Math.min(100, (stats.scholarsAttended / stats.totalScholarsRegistered) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Attendance Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Attendance Check-Ins</CardTitle>
          <Link href="/admin/attendance" className="text-xs font-semibold text-[#2864B4] hover:underline">
            View All Records
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {stats.recentAttendance.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#667085]">
              No attendance records recorded yet for this session.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F9FC] text-[#667085] border-b border-[#E4E9F0]">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Attendee Name</th>
                    <th className="px-6 py-3 font-semibold">Category</th>
                    <th className="px-6 py-3 font-semibold">Identifier</th>
                    <th className="px-6 py-3 font-semibold">Timestamp</th>
                    <th className="px-6 py-3 font-semibold">Photo</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E9F0]">
                  {stats.recentAttendance.map((rec: any) => (
                    <tr key={rec.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                      <td className="px-6 py-3.5 font-bold text-[#182230]">
                        {rec.attendee?.name}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge variant="blue">
                          {rec.attendee?.category === 'guide' ? 'Guide' : 'PhD Scholar'}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 font-mono text-[#667085]">
                        {maskIdentifier(rec.attendee?.identifier, rec.attendee?.category)}
                      </td>
                      <td className="px-6 py-3.5 text-[#667085]">
                        {new Date(rec.captured_at_device).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-3.5">
                        {rec.photo?.available ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#16835D] font-medium">
                            <Camera className="w-3.5 h-3.5" /> Captured
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#667085]">Pending</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge variant="success">Confirmed</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
