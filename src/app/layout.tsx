import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegister from '@/components/common/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: 'MRF Event Attendance Tracker | Maharaja Research Foundation',
  description: 'Self-Service Kiosk and Management System for MRF Event Attendance',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#142D4E',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F7F9FC] text-[#182230] antialiased selection:bg-[#EAF2FC] selection:text-[#142D4E]">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
