'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function GateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid PIN');
        setLoading(false);
        return;
      }

      // Success - redirect to intended page
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#E03A3E]/10 border border-[#E03A3E]/20 mb-4">
            <svg
              className="w-8 h-8 text-[#E03A3E]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#E03A3E] mb-2">
            Early Access
          </h1>
          <p className="text-sm text-slate-400">
            Apex Trio Tracker is currently in early access.
            <br />
            Please enter the PIN to continue.
          </p>
        </div>

        {/* PIN Form */}
        <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Access PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN"
                autoFocus
                className="w-full rounded-xl border border-[#2A2E32] bg-[#0E1115] px-4 py-3 text-center text-lg tracking-[0.5em] text-slate-100 outline-none placeholder:text-slate-500 placeholder:tracking-normal focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !pin}
              className="w-full cursor-pointer rounded-xl border border-[#E03A3E] bg-[#E03A3E] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#B71C1C] hover:border-[#B71C1C] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying…' : 'Enter'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-500">
          Don&apos;t have the PIN? Contact the app administrator.
        </p>
      </div>
    </main>
  );
}

export default function GatePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10 flex items-center justify-center">
          <div className="text-sm text-slate-400">Loading…</div>
        </main>
      }
    >
      <GateContent />
    </Suspense>
  );
}
