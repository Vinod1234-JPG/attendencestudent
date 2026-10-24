'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Eye, EyeOff, Lock, Mail, Shield, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials.');
      }

      router.push('/admin');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md bg-white border border-[#E4E9F0] rounded-2xl shadow-sm p-8 md:p-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#142D4E] flex items-center justify-center text-white mx-auto mb-3 shadow-sm">
            <GraduationCap className="w-7 h-7 text-[#EAF2FC]" />
          </div>
          <h1 className="text-sm font-bold tracking-widest text-[#2864B4] uppercase">
            Maharaja Research Foundation
          </h1>
          <h2 className="text-2xl font-bold text-[#142D4E] mt-1">Welcome Back</h2>
          <p className="text-xs text-[#667085] mt-1">
            Sign in to manage event attendance.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-3.5 bg-[#C0393A]/10 border border-[#C0393A]/20 rounded-lg flex items-start gap-2.5 text-xs text-[#C0393A]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Administrator Email"
            type="email"
            placeholder="admin@mrf.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />

          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-9 text-[#667085] hover:text-[#142D4E] focus:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            className="w-full mt-2 shadow-sm"
          >
            Sign In
          </Button>
        </form>

        {/* Security Notice */}
        <div className="mt-8 pt-6 border-t border-[#E4E9F0] text-center">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#667085]">
            <Shield className="w-3.5 h-3.5 text-[#2864B4]" />
            <span>Authorized MRF personnel only. Sessions are audited.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
