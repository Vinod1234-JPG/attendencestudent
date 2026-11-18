'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminTopBar } from '@/components/layout/AdminTopBar';
import { AppFooter } from '@/components/common/AppFooter';

/**
 * Admin page frame. On large screens the sidebar is always visible; on phones and
 * tablets it becomes a slide-in drawer opened from the top bar's menu button.
 */
export function AdminShell({
  userEmail,
  userRole,
  role,
  children,
}: {
  userEmail: string;
  userRole: string;
  role: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Teachers have no business on the admin-only pages (the server blocks them too); send them home.
  useEffect(() => {
    const adminOnly = ['/admin/teachers', '/admin/event', '/admin/audit', '/admin/sync'];
    if (role === 'teacher' && adminOnly.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      router.replace('/admin');
    }
  }, [role, pathname, router]);

  // Close the drawer after navigating.
  useEffect(() => setOpen(false), [pathname]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FC]">
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <AdminSidebar userEmail={userEmail} userRole={userRole} role={role} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <AdminTopBar onMenuClick={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-[#F7F9FC] flex flex-col justify-between">
          <div className="p-4 sm:p-6 lg:p-8 flex-1 min-w-0">{children}</div>
          <AppFooter />
        </main>
      </div>
    </div>
  );
}
