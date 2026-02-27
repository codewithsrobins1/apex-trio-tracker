# 🎮 Apex Trio Tracker
A real-time stat tracker for Apex Legends squads. Log damage, kills, and RP during sessions, visualize season progression, and post summaries straight to Discord.

## 🚀 Quick Start

### 1. Install
```bash
npm install
```

### 2. Environment Variables
Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=your-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DISCORD_WEBHOOK_URL=your-webhook-url
```

### 3. Run
```bash
npm run dev
```

## 📱 Features

| Feature | Description |
|---------|-------------|
| 📊 Session Tracking | Log damage, kills, placement, and RP per game |
| 🔴 Live Sharing | Host shares a link — teammates see stats in real-time |
| 📈 Season Progression | Interactive RP graph with per-player filters |
| 🎮 Host Controls | Add players, undo games, manage the session |
| 👤 Player Controls | Each player edits only their own RP row |
| 🏆 Win Tracking | Auto-increments on placement = 1 |
| 🍩 Donut Counter | Tracks 0 damage + 0 kill games |
| 🤖 Discord Integration | Post formatted session summaries with one click |

## 👥 User Roles

| Role | How | Can Do |
|------|-----|--------|
| **Host** | Creates the session | Full controls — add players, enter stats, post to Discord |
| **Player** | Joins via share link | View all stats, edit only their own RP |

Host is determined by a `writeKey` stored in `localStorage` at session creation.

## 🛠 Tech Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 15** | React framework with App Router |
| **TypeScript** | Type-safe JavaScript |
| **Tailwind CSS** | Utility-first styling |
| **Supabase** | PostgreSQL + Auth + Real-time |
| **Recharts** | Season progression graph |
| **Discord Webhooks** | Session summary posting |
