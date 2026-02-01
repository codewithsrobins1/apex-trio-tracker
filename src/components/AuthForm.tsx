'use client';

import { useState } from 'react';
import { register, login } from '@/lib/auth';

type AuthFormProps = {
  onSuccess: () => void;
};

export default function AuthForm({ onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!displayName.trim()) {
          throw new Error('Display name is required');
        }
        if (username.length < 3) {
          throw new Error('Username must be at least 3 characters');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }
        await register(username, password, displayName);
      } else {
        await login(username, password);
      }
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-[#2A2E32] bg-[#0E1115] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E]';

  const btnPrimary =
    'w-full cursor-pointer rounded-xl border border-[#E03A3E] bg-[#E03A3E] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#B71C1C] hover:border-[#B71C1C] transition disabled:opacity-50 disabled:cursor-not-allowed';

  const btnGhost =
    'cursor-pointer text-sm text-slate-400 hover:text-white underline underline-offset-4 transition';

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-100 mb-1">
          {mode === 'login' ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          {mode === 'login'
            ? 'Enter your credentials to continue'
            : 'Set up your account to start tracking'}
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How others will see you"
                className={inputClass}
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
              placeholder="Your unique username"
              className={inputClass}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inputClass}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          <button type="submit" disabled={loading} className={btnPrimary}>
            {loading
              ? mode === 'login'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'login'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          {mode === 'login' ? (
            <p className="text-sm text-slate-400">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={btnGhost}
              >
                Create one
              </button>
            </p>
          ) : (
            <p className="text-sm text-slate-400">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={btnGhost}
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
