import React from 'react';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/layout/AdminShell';
import { getCurrentAdmin } from '@/lib/auth/requireAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already redirects unauthenticated visitors; this reads who is signed in.
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');

  return (
    <AdminShell
      userEmail={admin?.email || ''}
      userRole={admin.role === 'super_admin' ? 'Super Administrator' : admin.role === 'teacher' ? 'Teacher' : 'Administrator'}
      role={admin.role}
    >
      {children}
    </AdminShell>
  );
}
