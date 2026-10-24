import React from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminTopBar } from '@/components/layout/AdminTopBar';

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
        <main className="flex-1 overflow-y-auto p-8 bg-[#F7F9FC]">
          {children}
        </main>
      </div>
    </div>
  );
}
