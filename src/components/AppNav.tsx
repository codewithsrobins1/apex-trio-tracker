'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { ThemeToggle } from './ThemeProvider';
import { fetchMyProfile, type Profile } from '@/lib/auth';

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  
  // Refs for measuring button positions
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pillStyle, setPillStyle] = useState({ width: 0, left: 0 });

  useEffect(() => {
    fetchMyProfile().then(setProfile).catch(console.error);
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push('/gate');
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

  // Find active index
  const activeIndex = navItems.findIndex((item) => isActive(item.href));

  // Update pill position when active tab changes or on mount
  useEffect(() => {
    const updatePillPosition = () => {
      const activeButton = buttonRefs.current[activeIndex];
      const container = containerRef.current;
      
      if (activeButton && container) {
        const containerRect = container.getBoundingClientRect();
        const buttonRect = activeButton.getBoundingClientRect();
        
        setPillStyle({
          width: buttonRect.width,
          left: buttonRect.left - containerRect.left,
        });
      }
    };

    updatePillPosition();
    
    // Also update on resize
    window.addEventListener('resize', updatePillPosition);
    return () => window.removeEventListener('resize', updatePillPosition);
  }, [activeIndex]);

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

          {/* Nav Pills with Sliding Background */}
          <div 
            ref={containerRef}
            className="relative flex gap-1 p-1 rounded-xl bg-card border border-themed"
          >
            {/* Sliding Pill Background */}
            <div
              className="absolute top-1 bottom-1 rounded-lg bg-accent shadow-md shadow-accent/30 transition-all duration-300 ease-out"
              style={{
                width: pillStyle.width,
                left: pillStyle.left,
              }}
            />
            
            {/* Nav Buttons */}
            {navItems.map((item, index) => (
              <button
                key={item.href}
                ref={(el) => { buttonRefs.current[index] = el; }}
                onClick={() => router.push(item.href)}
                className={`relative z-10 px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 cursor-pointer ${
                  isActive(item.href)
                    ? 'text-white'
                    : 'text-secondary hover:text-primary'
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
