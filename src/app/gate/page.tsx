'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';
import { supabase } from '@/lib/supabase/client';

function GateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/app';

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // Check if user already has PIN access (cookie exists) and if already signed in
  useEffect(() => {
    const checkAccess = async () => {
      try {
        // Check if site_access cookie exists
        const hasCookie = document.cookie.split(';').some(c => c.trim().startsWith('site_access='));
        setHasAccess(hasCookie);

        // If has cookie, check if also signed in
        if (hasCookie) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            // Already signed in, redirect to app
            router.push(redirectTo);
            return;
          }
        }
      } catch {
        setHasAccess(false);
      } finally {
        setCheckingAccess(false);
      }
    };
    checkAccess();
  }, [router, redirectTo]);

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid PIN');
        setLoading(false);
        return;
      }

      // PIN verified, show login form
      setHasAccess(true);
      setLoading(false);
    } catch (err) {
      console.error('PIN verification error:', err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  function handleLoginSuccess() {
    // User logged in, redirect to app
    window.location.href = redirectTo;
  }

  if (checkingAccess) {
    return (
      <main className="min-h-screen bg-primary px-4 py-10 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-secondary">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-primary px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-glow border border-accent/20 mb-4">
            <svg
              className="w-8 h-8 text-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {hasAccess ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              )}
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-accent mb-2">
            {hasAccess ? 'Sign In' : 'Early Access'}
          </h1>
          <p className="text-sm text-secondary">
            {hasAccess ? (
              'Sign in to your account to continue'
            ) : (
              <>
                Apex Trio Tracker is currently in early access.
                <br />
                Please enter the PIN to continue.
              </>
            )}
          </p>
        </div>

        {hasAccess ? (
          // Show login form
          <AuthForm onSuccess={handleLoginSuccess} />
        ) : (
          // Show PIN form
          <div className="card p-6">
            {error && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-tertiary mb-2">
                  Access PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter PIN"
                  autoFocus
                  className="input text-center text-lg tracking-[0.5em] placeholder:tracking-normal"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !pin}
                className="w-full btn-primary py-3"
              >
                {loading ? 'Verifying…' : 'Enter'}
              </button>
            </form>
          </div>
        )}

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-tertiary">
          {hasAccess
            ? 'Need help? Contact the app administrator.'
            : "Don't have the PIN? Contact the app administrator."}
        </p>
      </div>
    </main>
  );
}

export default function GatePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-primary px-4 py-10 flex items-center justify-center">
          <div className="text-sm text-secondary">Loading…</div>
        </main>
      }
    >
      <GateContent />
    </Suspense>
  );
}
