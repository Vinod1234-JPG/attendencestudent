'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  GraduationCap,
  CheckCircle2,
  Clock,
  Percent,
  ArrowRight,
  RefreshCw,
  Camera,
  AlertCircle
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePolling } from '@/lib/hooks/usePolling';

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
      // Fetch recent attendance and registry statistics in parallel for instant speed
      const [recRes, attRes] = await Promise.all([
        fetch(`/api/attendance?limit=5&_t=${Date.now()}`, { cache: 'no-store' }),
        fetch(`/api/admin/attendees?summary=1&_t=${Date.now()}`, { cache: 'no-store' }),
      ]);

      const [data, attData] = await Promise.all([recRes.json(), attRes.json()]);
      const recent = data?.records || [];

      const totalGuides = attData.counts?.guides || 0;
      const totalScholars = attData.counts?.scholars || 0;
      const totalReg = attData.counts?.total ?? attData.counts?.students ?? totalGuides + totalScholars;
      const totalAttended = attData.counts?.attended || data.pagination?.total || 0;
      const guidesAttended = attData.counts?.attendedGuides ?? 0;
      const scholarsAttended = attData.counts?.attendedScholars ?? 0;

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

  // Refresh every 20 s, but only while this tab is visible
  usePolling(fetchStats, 20000);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-[#E4E9F0] shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142D4E]">Attendance Operations Dashboard</h1>
          <p className="text-xs text-[#667085] mt-1">
            Real-time monitoring of MIT Mysore student attendance.
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
            <GraduationCap className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-[#142D4E]">No Students Registered Yet</h3>
          <p className="text-xs text-[#667085] max-w-md mx-auto mt-1 mb-4">
            Students register themselves the first time they check in at the kiosk with their name and college.
          </p>
          <Link href="/kiosk" target="_blank">
            <Button variant="primary" size="md">
              Open Live Kiosk <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      )}

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/admin/attendees">
          <Card className="hover:border-[#2864B4] transition-colors cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#667085]">Total Registered</span>
                <Users className="w-4 h-4 text-[#2864B4]" />
              </div>
              <p className="text-2xl font-bold text-[#142D4E] mt-2">{stats.totalRegistered}</p>
              <p className="text-[11px] text-[#2864B4] font-medium mt-1">
                Students (View Registry →)
              </p>
            </CardContent>
          </Card>
        </Link>

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
              <span className="text-xs font-semibold text-[#667085]">Not Yet Checked In</span>
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
                    <th className="px-6 py-3 font-semibold">Student Name</th>
                    <th className="px-6 py-3 font-semibold">College</th>
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
                      <td className="px-6 py-3.5 text-[#667085]">
                        {rec.attendee?.college || rec.attendee?.identifier || '—'}
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
