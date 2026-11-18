'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  QrCode,
  ClipboardList,
  Download,
  Settings,
  RefreshCw,
  History,
  LogOut,
  Shield,
  GraduationCap,
  Users,
  UserPlus,
  MonitorPlay,
} from 'lucide-react';

interface AdminSidebarProps {
  userEmail?: string;
  userRole?: string;
  /** Raw role: 'admin' | 'super_admin' | 'teacher'. Teachers do not see the admin-only pages. */
  role?: string;
}

export function AdminSidebar({
  userEmail = 'admin@mrf.org',
  userRole = 'Administrator',
  role = 'admin',
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error', e);
    }
    router.push('/login');
    router.refresh();
  };

  const allItems: { label: string; href: string; icon: any; isExternal?: boolean; adminOnly?: boolean }[] = [
    { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { label: 'Teachers', href: '/admin/teachers', icon: Users, adminOnly: true },
    { label: 'Student Registration', href: '/admin/students', icon: UserPlus },
    { label: 'Live Display', href: '/admin/attendees', icon: MonitorPlay },
    { label: 'Take Attendance', href: '/kiosk', icon: QrCode, isExternal: true },
    { label: 'Attendance Records', href: '/admin/attendance', icon: ClipboardList },
    { label: 'Export Attendance Details', href: '/admin/exports', icon: Download },
    { label: 'Event Settings', href: '/admin/event', icon: Settings, adminOnly: true },
    { label: 'Sync Status', href: '/admin/sync', icon: RefreshCw, adminOnly: true },
    { label: 'Audit Log', href: '/admin/audit', icon: History, adminOnly: true },
  ];
  // Teachers get the same dashboard, minus the pages that change global settings or other people's data
  const navItems = allItems.filter((item) => !item.adminOnly || role !== 'teacher');

  return (
    <aside className="w-64 bg-[#142D4E] text-white flex flex-col shrink-0 min-h-screen border-r border-[#0B1B30] select-none">
      {/* Brand Header */}
      <div className="p-6 border-b border-[#0B1B30] flex items-center gap-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-white shadow-sm shrink-0 flex items-center justify-center p-0.5 border border-white/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="MRF Logo" className="w-full h-full object-contain rounded-full" />
        </div>
        <div className="overflow-hidden">
          <h1 className="font-bold text-sm tracking-wide text-white leading-tight">MIT MYSORE STUDENTS</h1>
          <p className="text-[11px] text-[#CBD5E1] truncate">Attendance Tracker</p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              target={item.isExternal ? '_blank' : undefined}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#2864B4] text-white shadow-sm'
                  : 'text-[#EAF2FC]/80 hover:bg-[#0B1B30] hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#EAF2FC]/70'}`} />
              <span className="truncate">{item.label}</span>
              {item.isExternal && (
                <span className="ml-auto text-[10px] bg-[#0B1B30] text-[#EAF2FC] px-1.5 py-0.5 rounded">
                  Kiosk
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Admin User & Logout */}
      <div className="p-4 border-t border-[#0B1B30] bg-[#0B1B30]/50">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-[#2864B4]/30 border border-[#2864B4] flex items-center justify-center text-xs font-semibold text-[#EAF2FC]">
            <Shield className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-white truncate">{userEmail}</p>
            <p className="text-[10px] text-[#CBD5E1] capitalize">{userRole}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-red-200 hover:text-white hover:bg-[#C0393A] rounded transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
