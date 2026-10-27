import React from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminTopBar } from '@/components/layout/AdminTopBar';
import { AppFooter } from '@/components/common/AppFooter';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FC]">
      <AdminSidebar userEmail="admin@mrf.org" userRole="Administrator" />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <AdminTopBar />
        <main className="flex-1 overflow-y-auto bg-[#F7F9FC] flex flex-col justify-between">
          <div className="p-8 flex-1">
            {children}
          </div>
          <AppFooter />
        </main>
      </div>
    </div>
  );
}
