'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { ThemeToggle } from './ThemeProvider';
import { fetchMyProfile, type Profile } from '@/lib/auth';

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetchMyProfile().then(setProfile).catch(console.error);
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push('/');
  };

  const navItems = [
    { label: 'Dashboard', href: '/app' },
    { label: 'Leaderboard', href: '/app/season-progression' },
  ];

  const isActive = (href: string) => {
    if (href === '/app') {
      return pathname === '/app' || pathname === '/app/in-game-tracker';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-themed bg-primary/80 backdrop-blur-xl">
      <div className="page-container">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={() => router.push('/app')}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-lg shadow-accent/20">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 19h20L12 2zm0 4l6.5 11h-13L12 6z" />
              </svg>
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-bold text-primary leading-tight">Apex Trio</div>
              <div className="text-[10px] tracking-widest text-tertiary uppercase">Tracker</div>
            </div>
          </button>

          {/* Nav Pills */}
          <div className="flex gap-1 p-1 rounded-xl bg-card border border-themed">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
                  isActive(item.href)
                    ? 'bg-accent text-white shadow-md shadow-accent/30'
                    : 'text-secondary hover:text-primary hover:bg-card-hover'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* User display */}
            {profile && (
              <div className="hidden md:flex items-center gap-2 text-sm">
                <span className="text-tertiary">Playing as</span>
                <span className="font-semibold text-primary">{profile.display_name}</span>
              </div>
            )}

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="px-4 py-2 text-sm font-medium text-secondary bg-card border border-themed rounded-xl hover:text-primary hover:border-accent transition-all cursor-pointer disabled:opacity-50"
            >
              {signingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
