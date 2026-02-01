# Apex Trio Tracker

A real-time stat tracking application for Apex Legends squads. Track damage, kills, RP, and more during gaming sessions with your friends, then post results to Discord and visualize season progression.

![Next.js](https://img.shields.io/badge/Next.js-15.4-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Database-green?logo=supabase)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?logo=tailwind-css)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Pages & Routes](#pages--routes)
- [User Roles](#user-roles)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Supabase Setup](#supabase-setup)
- [How It Works](#how-it-works)
- [API Routes](#api-routes)
- [Real-time Updates](#real-time-updates)
- [Discord Integration](#discord-integration)
- [Admin Scripts](#admin-scripts)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Overview

Apex Trio Tracker is designed for small groups of friends (3-4 players) who play Apex Legends together and want to track their performance over a season. The application provides:

- **Session Tracking**: Track damage, kills, placement, and RP for each game during a gaming session
- **Live Sharing**: Host shares a link with teammates who can view stats in real-time and track their own RP
- **Season Progression**: Visualize cumulative RP gains over time with an interactive graph
- **Discord Integration**: Post session summaries to a Discord channel with one click

---

## Features

### Authentication
- Username/password authentication (no email required)
- Persistent sessions (stay logged in across browser sessions)
- Simple user management for small friend groups

### Season Management
- Global season system (one active season at a time)
- Anyone can set or reset the season
- Season reset clears all RP data with confirmation

### In-Game Tracker
- **Host Controls**:
  - Add/remove players (up to 3)
  - Enter damage and kills per player per game
  - Enter squad placement (1-20)
  - Add games with automatic stat aggregation
  - Undo last game if mistakes are made
  - Post session to Discord

- **Player Controls**:
  - View all stats in real-time
  - Track their own RP (only their row is editable)
  - Add/undo their RP entries

- **Stats Tracked**:
  - Total Damage
  - Total Kills
  - 1k Games (1000+ damage)
  - 2k Games (2000+ damage)
  - Average Damage
  - Donuts (0 damage AND 0 kills)
  - Individual RP

- **Summary Cards**:
  - Games played
  - Wins (auto-incremented when placement = 1)
  - Average Placement
  - Squad Total RP

### Season Progression Graph
- Line chart showing cumulative RP over time
- Y-axis: -5000 to +5000 (0 centered)
- X-axis: Dates in MM/DD/YY format (angled)
- Player filter checkboxes
- "All" checkbox to show/hide all players
- Individual player stats cards

### Discord Integration
- Posts formatted session summary
- Includes all player stats
- Shows squad totals
- Triggered by host with confirmation

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 15** | React framework with App Router |
| **TypeScript** | Type-safe JavaScript |
| **Tailwind CSS** | Utility-first styling |
| **Supabase** | PostgreSQL database + Auth + Real-time |
| **Recharts** | Charting library for season progression |
| **Discord Webhooks** | Post session summaries |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Home      │  │  In-Game    │  │  Season             │  │
│  │   Page      │  │  Tracker    │  │  Progression        │  │
│  │             │  │             │  │                     │  │
│  │  - Auth     │  │  - Stats    │  │  - RP Graph         │  │
│  │  - Season   │  │  - Live     │  │  - Player Filter    │  │
│  │    Control  │  │    Sharing  │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Routes                              │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │  /api/post-session  │  │  /api/discord               │   │
│  │                     │  │                             │   │
│  │  - POST: Create     │  │  - POST: Send webhook       │   │
│  │  - PUT: Update      │  │                             │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Supabase                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Auth      │  │  Database   │  │  Real-time          │  │
│  │             │  │             │  │                     │  │
│  │  - Users    │  │  - profiles │  │  - Session updates  │  │
│  │  - Sessions │  │  - seasons  │  │    broadcast to     │  │
│  │             │  │  - sessions │  │    all viewers      │  │
│  │             │  │  - rp_entries│ │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Tables

#### `profiles`
Stores user profile information, linked to Supabase Auth.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (matches auth.users.id) |
| username | TEXT | Unique username for login |
| display_name | TEXT | Display name shown in UI |
| created_at | TIMESTAMPTZ | Account creation time |

#### `seasons`
Tracks Apex Legends seasons.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| season_number | INTEGER | Apex season number (e.g., 27, 28) |
| is_active | BOOLEAN | Whether this is the current season |
| created_at | TIMESTAMPTZ | When season was created |
| created_by | UUID | User who created the season |

#### `season_players`
Junction table for users participating in a season.

| Column | Type | Description |
|--------|------|-------------|
| season_id | UUID | Foreign key to seasons |
| user_id | UUID | Foreign key to profiles |
| joined_at | TIMESTAMPTZ | When user joined the season |

#### `sessions`
Stores live tracking session data as JSON.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (used in share URLs) |
| season_number | INTEGER | Current season number |
| host_user_id | UUID | User who created the session |
| write_key | TEXT | Secret key for host to save updates |
| doc | JSONB | Session state (players, stats, games) |
| created_at | TIMESTAMPTZ | Session creation time |
| updated_at | TIMESTAMPTZ | Last update time |

#### `season_rp_entries`
Stores RP entries for the season progression graph.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| season_id | UUID | Foreign key to seasons |
| user_id | UUID | Foreign key to profiles |
| delta_rp | INTEGER | RP change (positive or negative) |
| entry_date | DATE | Date of the entry |
| posted_from_session_id | UUID | Optional link to session |
| created_at | TIMESTAMPTZ | Entry creation time |

---

## Pages & Routes

### `/` - Home Page
- **Logged out**: Shows login/register form
- **Logged in**: Shows season controls and navigation
  - Set/reset season
  - Navigate to In-Game Tracker
  - Navigate to Season Progression

### `/in-game-tracker` - Session Tracker
- **Without `?s=` param**: Start new session
- **With `?s=SESSION_ID`**: Join existing session
- Host sees all controls
- Players see read-only stats + their RP input

### `/season-progression` - RP Graph
- Line chart of cumulative RP
- Player filter checkboxes
- Stats summary cards

---

## User Roles

### Host
The user who creates a session becomes the host. Hosts can:
- Add/remove players
- Enter damage, kills, placement
- Add/undo games
- Update any player's RP
- Post session to Discord

### Player
Users who join via share link are players. Players can:
- View all stats in real-time
- Update only their own RP
- See their row highlighted

### How Host is Determined
When a session is created:
1. A unique `writeKey` is generated
2. The `writeKey` is stored in the host's `localStorage`
3. When loading a session, if `localStorage` has the matching `writeKey`, user is host

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account
- Discord webhook URL

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd apex-trio-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Supabase and Discord credentials.

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open the app**
   Navigate to `http://localhost:3000`

---

## Environment Variables

Create a `.env.local` file with:

```env
# Supabase (client-side)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Supabase (server-side)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Where to Find These

- **Supabase URL & Keys**: Supabase Dashboard → Settings → API
- **Discord Webhook**: Server Settings → Integrations → Webhooks → New Webhook

---

## Supabase Setup

### 1. Create a New Project
Go to [supabase.com](https://supabase.com) and create a new project.

### 2. Run the Schema SQL
In SQL Editor, run the schema from the setup file to create all tables.

### 3. Configure Authentication
1. Go to Authentication → Providers
2. Ensure Email provider is enabled
3. Go to Authentication → Settings
4. **Turn OFF** "Confirm email" (important!)

### 4. Enable Real-time
Run this SQL to enable real-time updates:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
```

---

## How It Works

### Session Flow

```
1. Host opens /in-game-tracker
         │
         ▼
2. Host clicks "Share Live Link"
         │
         ▼
3. Session created in Supabase
   - Generates unique session ID
   - Generates write key (stored in host's localStorage)
   - URL copied to clipboard
         │
         ▼
4. Host shares URL with teammates
         │
         ▼
5. Players open URL
   - Load session from Supabase
   - Subscribe to real-time updates
   - No write key = player role
         │
         ▼
6. During session:
   - Host enters stats, adds games
   - Changes auto-save to Supabase (debounced 500ms)
   - Players see updates in real-time
   - Players can update their own RP
         │
         ▼
7. Host clicks "Post to Discord"
   - Confirmation modal appears
   - Stats posted to Discord webhook
   - Each player's RP saved to season_rp_entries
   - Session can continue or be reset
```

### RP Tracking Flow

```
1. During session:
   - Each player tracks their own RP per game
   - RP can be positive or negative
   - Stored locally in session doc
         │
         ▼
2. When "Post to Discord" is clicked:
   - Each player's total session RP is extracted
   - Inserted into season_rp_entries table
   - Entry date = current date
         │
         ▼
3. Season Progression page:
   - Queries season_rp_entries for active season
   - Groups by date and user
   - Calculates cumulative totals
   - Renders line chart
```

---

## API Routes

### `POST /api/post-session`
Creates a new session.

**Request:**
```json
{
  "seasonNumber": 27,
  "hostUserId": "uuid",
  "doc": { /* session state */ }
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "writeKey": "uuid"
}
```

### `PUT /api/post-session`
Updates an existing session.

**Request:**
```json
{
  "sessionId": "uuid",
  "writeKey": "uuid",
  "doc": { /* updated session state */ }
}
```

**Response:**
```json
{
  "success": true
}
```

### `POST /api/discord`
Posts a message to Discord.

**Request:**
```json
{
  "payload": {
    "content": "Message content"
  }
}
```

**Response:**
```json
{
  "success": true
}
```

---

## Real-time Updates

The app uses Supabase Real-time to sync session data:

```typescript
const channel = supabase
  .channel(`session-${sessionId}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'sessions',
      filter: `id=eq.${sessionId}`,
    },
    (payload) => {
      // Update local state with new data
      const doc = payload.new.doc;
      setPlayers(doc.players);
      // ... etc
    }
  )
  .subscribe();
```

**Important**: Players preserve their local RP state when receiving updates to avoid overwrites.

---

## Discord Integration

### Webhook Setup
1. Go to your Discord server
2. Server Settings → Integrations → Webhooks
3. Create a new webhook
4. Copy the webhook URL
5. Add to `.env.local` as `DISCORD_WEBHOOK_URL`

### Message Format
```
**Apex Session Summary — Season 27**
Games: 10 | Wins: 2 | Avg Placement: 5.3

**#1 PlayerOne**
• Damage: 12,450 (Avg: 1245)
• Kills: 23
• 1k Games: 7 | 2k Games: 2
• Donuts: 1
• Session RP: +156

**#2 PlayerTwo**
...

**Squad Total RP: +423**
```

---

## Admin Scripts

The `helpfulScripts.sql` file contains useful queries:

| Script | Purpose |
|--------|---------|
| Reset all data | Truncate all tables |
| View all users | See usernames and profiles |
| Reset password | Update a user's password |
| View seasons | See all seasons and status |
| Set active season | Change the active season |
| View RP entries | See RP data for a season |
| View season totals | Total RP per player |
| Add/update RP | Manual RP management |
| Delete RP entries | Remove specific entries |
| View sessions | See active tracker sessions |
| Quick stats | Overview dashboard |

### Common Admin Tasks

**Reset a user's password:**
```sql
UPDATE auth.users 
SET encrypted_password = crypt('newpassword123', gen_salt('bf'))
WHERE email = 'username@apex.local';
```

**View all users:**
```sql
SELECT p.username, p.display_name, au.created_at
FROM public.profiles p
JOIN auth.users au ON p.id = au.id;
```

**Reset all data for new season:**
```sql
TRUNCATE TABLE public.season_rp_entries, public.sessions, 
  public.season_players, public.seasons 
RESTART IDENTITY CASCADE;
```

---

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Environment Variables in Vercel
Add all variables from `.env.local` to:
- Vercel Dashboard → Project → Settings → Environment Variables

---

## Troubleshooting

### "Not signed in" after refresh
- Check that Supabase session persistence is working
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct

### Real-time updates not working
- Ensure real-time is enabled: `ALTER PUBLICATION supabase_realtime ADD TABLE sessions;`
- Check browser console for WebSocket errors

### "Failed to create session"
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Check that the `sessions` table exists

### Discord posting fails
- Verify `DISCORD_WEBHOOK_URL` is correct
- Check that the webhook is not deleted in Discord

### Password reset not working
- Use the SQL query with `crypt()` function
- Make sure you're using the correct username (lowercase)

---

## License

MIT License - feel free to use and modify for your own squad!

---

## Contributing

This is a personal project for a small friend group, but feel free to fork and adapt for your own needs!

---

## Acknowledgments

- Apex Legends by Respawn Entertainment
- Built with Next.js, Supabase, and Tailwind CSS
- Charts powered by Recharts
