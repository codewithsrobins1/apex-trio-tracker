'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './landing.module.scss';

// ── Data ───────────────────────────────────────────────────────────────────────

const players = [
  {
    name: 'WraithKiller99',
    legend: 'Wraith',
    avatar: '🎯',
    kills: 18,
    damage: '3,421',
    rp: '+180',
    color: '#ff5252',
    rankColor: styles.rank1,
    rank: 1,
  },
  {
    name: 'ValkyrieX',
    legend: 'Valkyrie',
    avatar: '⚡',
    kills: 14,
    damage: '2,890',
    rp: '+140',
    color: '#ff6d00',
    rankColor: styles.rank2,
    rank: 2,
  },
  {
    name: 'BangaloreAce',
    legend: 'Bangalore',
    avatar: '💥',
    kills: 9,
    damage: '1,760',
    rp: '+90',
    color: '#ffa000',
    rankColor: styles.rank3,
    rank: 3,
  },
];

const features = [
  {
    icon: '📡',
    title: 'Live Session Sharing',
    desc: 'Share a 6-digit code with your squad. Everyone sees stats update in real-time without refresh.',
    colorClass: styles.fiBlue,
  },
  {
    icon: '📊',
    title: 'Season Progression',
    desc: "Visualize your squad's RP journey with interactive charts, streaks, and head-to-head comparisons.",
    colorClass: styles.fiPurple,
  },
  {
    icon: '🏆',
    title: 'Leaderboard & Awards',
    desc: 'Crown the MVP with Most Kills, Most Damage, Best KD — and yes, the dreaded Donut Award.',
    colorClass: styles.fiEmerald,
  },
  {
    icon: '👤',
    title: 'Personal Dashboard',
    desc: 'Deep-dive into your personal stats across every session. Track your improvement, spot weak spots.',
    colorClass: styles.fiIndigo,
  },
  {
    icon: '💬',
    title: 'Discord Integration',
    desc: 'Auto-post session summaries and highlights directly to your Discord server after each game.',
    colorClass: styles.fiRose,
  },
  {
    icon: '🌓',
    title: 'Light & Dark Mode',
    desc: 'Adapts to your preference. Engineered for late-night ranked grinds and bright afternoon solos.',
    colorClass: styles.fiAmber,
  },
];

const summaryStats = [
  { val: '41', label: 'Total Kills' },
  { val: '8,071', label: 'Total Dmg' },
  { val: '+410', label: 'Net RP' },
];

const globalStats = [
  {
    label: 'Total Kills',
    value: '12,847',
    icon: '🎯',
    colorClass: styles.statCardBlue,
  },
  {
    label: 'Damage Dealt',
    value: '4.2M',
    icon: '💥',
    colorClass: styles.statCardPurple,
  },
  {
    label: 'RP Gained',
    value: '+8,420',
    icon: '📈',
    colorClass: styles.statCardEmerald,
  },
  {
    label: 'Sessions Tracked',
    value: '156',
    icon: '🎮',
    colorClass: styles.statCardIndigo,
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;

  const goToApp = () => router.push('/app');
  const scrollToFeatures = () =>
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className={styles.pageWrapper}>
      {/* ── Backgrounds ── */}
      <div className={styles.canvasBg}>
        <div className={`${styles.orb} ${styles.orb1}`} />
        <div className={`${styles.orb} ${styles.orb2}`} />
        <div className={`${styles.orb} ${styles.orb3}`} />
      </div>
      <div className={styles.noise} />
      <div className={styles.gridLines} />

      {/* ── Nav ── */}
      <nav className={`${styles.nav} ${styles.animateFadeUp}`}>
        <div className={styles.navLogo}>
          <div className={styles.logoIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 19h20L12 2zm0 4l6.5 11h-13L12 6z" />
            </svg>
          </div>
          <span className={styles.logoText}>Apex Trio Tracker</span>
        </div>
        <div className={styles.navRight}>
          <button className={styles.navLink} onClick={scrollToFeatures}>
            Features
          </button>
          <button className={styles.btnSecondary} onClick={goToApp}>
            Sign in
          </button>
          <button className={styles.btnPrimary} onClick={goToApp}>
            Launch App
            <ArrowIcon />
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        {/* Left — copy */}
        <div>
          <div
            className={`${styles.badge} ${styles.animateFadeUp} ${styles.delay1}`}
          >
            <span className={styles.badgeDot} />
            Live Session Tracking · Season 21
          </div>

          <h1
            className={`${styles.heroTitle} ${styles.animateFadeUp} ${styles.delay2}`}
          >
            Track Your
            <br />
            <span className={styles.gradientText}>Squad&apos;s Legacy</span>
          </h1>

          <p
            className={`${styles.heroSubtitle} ${styles.animateFadeUp} ${styles.delay3}`}
          >
            Real-time stat tracking for your Apex Legends trio. Monitor kills,
            damage, RP gains, and crown your squad&apos;s true champion each
            season.
          </p>

          <div
            className={`${styles.heroCta} ${styles.animateFadeUp} ${styles.delay4}`}
          >
            <button
              className={`${styles.btnPrimary} ${styles.btnHero}`}
              onClick={goToApp}
            >
              Get Started Free
              <ArrowIcon size={16} />
            </button>
            <button
              className={`${styles.btnSecondary} ${styles.btnHero}`}
              onClick={scrollToFeatures}
            >
              See Features
            </button>
          </div>
        </div>

        {/* Right — preview card */}
        <div
          className={`${styles.heroVisual} ${styles.animateFadeUp} ${styles.delay3}`}
        >
          <div className={styles.dashboardPreview}>
            <div className={styles.previewHeader}>
              <span className={styles.previewTitle}>Session · #A4F2</span>
              <span className={styles.previewSession}>
                <LiveDot color="#e53935" />
                Live
              </span>
            </div>

            {players.map((p) => (
              <div className={styles.playerRow} key={p.name}>
                <div className={`${styles.rankBadge} ${p.rankColor}`}>
                  {p.rank}
                </div>
                <div
                  className={styles.playerAvatar}
                  style={{
                    background: `${p.color}18`,
                    border: `1px solid ${p.color}30`,
                  }}
                >
                  {p.avatar}
                </div>
                <div className={styles.playerInfo}>
                  <div className={styles.playerName} style={{ color: p.color }}>
                    {p.name}
                  </div>
                  <div className={styles.playerLegend}>{p.legend}</div>
                  <div className={styles.rpBarWrap}>
                    <div className={styles.rpBarTrack}>
                      <div
                        className={styles.rpBarFill}
                        style={{
                          width: `${[100, 78, 50][p.rank - 1]}%`,
                          background: `linear-gradient(90deg, ${p.color}80, ${p.color})`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className={styles.playerStats}>
                  <div className={styles.pstat}>
                    <div className={styles.pstatVal}>{p.kills}</div>
                    <div className={styles.pstatLabel}>Kills</div>
                  </div>
                  <div className={styles.pstat}>
                    <div className={styles.pstatVal}>{p.damage}</div>
                    <div className={styles.pstatLabel}>Dmg</div>
                  </div>
                  <div className={styles.pstat} style={{ minWidth: 40 }}>
                    <div
                      className={styles.pstatVal}
                      style={{ color: '#ff5252' }}
                    >
                      {p.rp}
                    </div>
                    <div className={styles.pstatLabel}>RP</div>
                  </div>
                </div>
              </div>
            ))}

            <div className={styles.previewFooter}>
              {summaryStats.map((s) => (
                <div className={styles.miniStat} key={s.label}>
                  <div className={styles.miniStatVal}>{s.val}</div>
                  <div className={styles.miniStatLabel}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Global Stats Row ── */}
      <div
        className={styles.section}
        style={{ paddingTop: 0, paddingBottom: 80 }}
      >
        <div className={styles.statsRow}>
          {globalStats.map((stat, i) => (
            <div
              key={stat.label}
              className={`${styles.statCard} ${stat.colorClass} ${styles.animateFadeUp}`}
              style={{ animationDelay: `${i * 80 + 200}ms` }}
            >
              <span className={styles.statIcon}>{stat.icon}</span>
              <div className={styles.statValue}>{stat.value}</div>
              <div className={styles.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className={styles.sectionDivider}>
        <div className={styles.dividerLine} />
      </div>

      {/* ── Features ── */}
      <section id="features" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionLabel}>Features</div>
          <h2 className={styles.sectionTitle}>
            Everything You Need
            <br />
            to Dominate
          </h2>
          <p className={styles.sectionSub}>
            Built by Apex players, for Apex players. Every feature earns its
            place.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`${styles.featureCard} ${styles.animateFadeUp}`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className={styles.featureGlow} />
              <div className={`${styles.featureIconWrap} ${f.colorClass}`}>
                {f.icon}
              </div>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <div className={styles.ctaSection}>
        <div className={styles.ctaCard}>
          <div className={`${styles.ctaOrb} ${styles.ctaOrbLeft}`} />
          <div className={`${styles.ctaOrb} ${styles.ctaOrbRight}`} />
          <h2 className={styles.ctaTitle}>
            Ready to Track
            <br />
            Your Trio?
          </h2>
          <p className={styles.ctaSub}>
            Join your squad and start climbing the ranks together.
          </p>
          <div className={styles.ctaButtons}>
            <button
              className={styles.btnPrimary}
              style={{ fontSize: 15, padding: '14px 36px' }}
              onClick={goToApp}
            >
              Get Started
              <ArrowIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerLogo}>
          <div className={styles.footerLogoIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 19h20L12 2zm0 4l6.5 11h-13L12 6z" />
            </svg>
          </div>
          <span className={styles.footerText}>Apex Trio Tracker</span>
        </div>
        <p className={styles.footerCopy}>
          Built with ❤️ for the Apex community
        </p>
      </footer>
    </div>
  );
}

// ── Tiny shared sub-components ────────────────────────────────────────────────

function ArrowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        d="M13 7l5 5m0 0l-5 5m5-5H6"
      />
    </svg>
  );
}

function LiveDot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        boxShadow: `0 0 8px ${color}`,
      }}
    />
  );
}
