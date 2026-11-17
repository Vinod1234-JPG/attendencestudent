import React from 'react';
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

  return (
    <AdminShell
      userEmail={admin?.email || ''}
      userRole={admin?.role === 'super_admin' ? 'Super Administrator' : 'Administrator'}
    >
      {children}
    </AdminShell>
  );
}
