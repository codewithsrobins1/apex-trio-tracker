'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/ThemeProvider';

export default function LandingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <main className="min-h-screen bg-primary overflow-hidden">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[96px]" />
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(var(--text-primary) 1px, transparent 1px),
                              linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-lg shadow-accent/20">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 19h20L12 2zm0 4l6.5 11h-13L12 6z" />
            </svg>
          </div>
          <span className="text-xl font-bold text-primary">
            Apex Trio Tracker
          </span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <button
            onClick={() => router.push('/app')}
            className="btn-primary"
          >
            Launch App
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-glow border border-accent/20 mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            <span className="text-sm font-medium text-accent">
              Live Session Tracking
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6">
            <span className="text-primary">Track Your</span>
            <br />
            <span className="text-accent">Squad&apos;s Legacy</span>
          </h1>

          <p className="text-lg sm:text-xl text-secondary max-w-2xl mx-auto mb-10">
            Real-time stat tracking for your Apex Legends trio. 
            Monitor kills, damage, RP gains, and crown your squad&apos;s 
            true champion each season.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => router.push('/app')}
              className="btn-primary text-lg px-8 py-4 w-full sm:w-auto"
            >
              Get Started Free
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
            <button
              onClick={() => {
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="btn-secondary text-lg px-8 py-4 w-full sm:w-auto"
            >
              See Features
            </button>
          </div>
        </div>

        {/* Stats preview */}
        <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {[
            { label: 'Total Kills', value: '12,847', icon: '🎯' },
            { label: 'Damage Dealt', value: '4.2M', icon: '💥' },
            { label: 'RP Gained', value: '+8,420', icon: '📈' },
            { label: 'Sessions', value: '156', icon: '🎮' },
          ].map((stat, idx) => (
            <div
              key={stat.label}
              className="stat-card text-center"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <div className="text-2xl mb-2">{stat.icon}</div>
              <div className="text-2xl sm:text-3xl font-bold text-primary mb-1">
                {stat.value}
              </div>
              <div className="text-xs text-tertiary uppercase tracking-wider">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 py-24 bg-secondary">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-primary mb-4">
              Everything You Need to Dominate
            </h2>
            <p className="text-lg text-secondary max-w-2xl mx-auto">
              Built by Apex players, for Apex players.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: '📡',
                title: 'Live Session Sharing',
                description: 'Share a 6-digit code with your squad. Everyone sees stats update in real-time.',
              },
              {
                icon: '📊',
                title: 'Season Progression',
                description: 'Visualize your squad\'s RP journey with beautiful charts and comparisons.',
              },
              {
                icon: '🏆',
                title: 'Leaderboard & Awards',
                description: 'Crown the MVP with Most Kills, Most Damage, and yes... Most Donuts.',
              },
              {
                icon: '👤',
                title: 'Personal Dashboard',
                description: 'Track your personal stats, view your improvement over time.',
              },
              {
                icon: '💬',
                title: 'Discord Integration',
                description: 'Post session summaries directly to your Discord server.',
              },
              {
                icon: '🌓',
                title: 'Light & Dark Mode',
                description: 'Easy on the eyes during those late-night sessions.',
              },
            ].map((feature, idx) => (
              <div
                key={feature.title}
                className="card p-6"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="w-12 h-12 rounded-xl bg-accent-glow flex items-center justify-center text-2xl mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-primary mb-2">
                  {feature.title}
                </h3>
                <p className="text-secondary text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary mb-4">
            Ready to Track Your Trio?
          </h2>
          <p className="text-lg text-secondary mb-8">
            Join your squad and start climbing the ranks together.
          </p>
          <button
            onClick={() => router.push('/app')}
            className="btn-primary text-lg px-10 py-4"
          >
            Launch Tracker
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-themed py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 19h20L12 2zm0 4l6.5 11h-13L12 6z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-primary">Apex Trio Tracker</span>
          </div>
          <p className="text-sm text-tertiary">
            Built with ❤️ for the Apex community
          </p>
        </div>
      </footer>
    </main>
  );
}
