'use client';

import React, { useState, useEffect } from 'react';
import {
  History,
  Shield,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '50',
        action: actionFilter,
        outcome: outcomeFilter,
      });

      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.warn('Failed to fetch audit logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, outcomeFilter]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142D4E]">System Audit Trail</h1>
          <p className="text-xs text-[#667085] mt-1">
            Immutable log of administrative operations, imports, synchronization, and security events.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} isLoading={isLoading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh Log
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
            <span className="text-xs font-semibold text-[#667085]">Outcome:</span>
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-md border border-[#E4E9F0] bg-white text-[#182230] focus:outline-none"
            >
              <option value="">All Outcomes</option>
              <option value="success">Success</option>
              <option value="warning">Warning / Conflict</option>
              <option value="failure">Failure</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
            <span className="text-xs font-semibold text-[#667085]">Action:</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-md border border-[#E4E9F0] bg-white text-[#182230] focus:outline-none"
            >
              <option value="">All Actions</option>
              <option value="ADMIN_LOGIN">Admin Login</option>
              <option value="ATTENDANCE_RECORDED">Attendance Recorded</option>
              <option value="SYNC_ATTENDANCE_SUCCESS">Sync Attendance Success</option>
              <option value="SYNC_CONFLICT_DETECTED">Sync Conflict Detected</option>
              <option value="MRF_DATA_IMPORTED">MRF Data Imported</option>
              <option value="ATTENDANCE_EXPORTED">Attendance Exported</option>
              <option value="EVENT_SETTINGS_UPDATED">Settings Updated</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Log Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] text-[#667085] border-b border-[#E4E9F0]">
                <tr>
                  <th className="px-6 py-3 font-semibold">Timestamp (UTC)</th>
                  <th className="px-6 py-3 font-semibold">Action</th>
                  <th className="px-6 py-3 font-semibold">Entity Type</th>
                  <th className="px-6 py-3 font-semibold">Outcome</th>
                  <th className="px-6 py-3 font-semibold">Details / Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E9F0]">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[#667085]">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#2864B4]" />
                      Loading audit events...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[#667085]">
                      No audit events recorded matching current filters.
                    </td>
                  </tr>
                ) : (
                  logs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-[#F7F9FC]/60">
                      <td className="px-6 py-3 text-[#667085] font-mono whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-3 font-semibold text-[#182230]">
                        {log.action}
                      </td>
                      <td className="px-6 py-3 text-[#667085] uppercase text-[11px] font-mono">
                        {log.entity_type}
                      </td>
                      <td className="px-6 py-3">
                        <Badge
                          variant={
                            log.outcome === 'success'
                              ? 'success'
                              : log.outcome === 'warning'
                              ? 'warning'
                              : 'error'
                          }
                        >
                          {log.outcome}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 font-mono text-[11px] text-[#667085] max-w-sm truncate">
                        {JSON.stringify(log.metadata)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
