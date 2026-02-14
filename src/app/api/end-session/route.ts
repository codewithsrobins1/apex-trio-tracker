import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

type PlayerDoc = {
  odlId: string;
  odlierId: string | null;
  name: string;
  games: number;
  totalDamage: number;
  totalKills: number;
  oneKGames: number;
  twoKGames: number;
  donuts: number;
  totalRP: number;
};

type SessionDoc = {
  players: PlayerDoc[];
  sessionGames: number;
  wins: number;
  totalPlacement: number;
  placements: number[];
};

// POST - End session and save all stats
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, postToDiscord } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing session ID' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Fetch the session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, season_number, doc')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const doc = session.doc as SessionDoc;

    // Get the season ID from season_number
    const { data: seasonData, error: seasonError } = await supabase
      .from('seasons')
      .select('id')
      .eq('season_number', session.season_number)
      .eq('is_active', true)
      .maybeSingle();

    if (seasonError || !seasonData) {
      return NextResponse.json({ error: 'Active season not found' }, { status: 404 });
    }

    const seasonId = seasonData.id;

    const results = {
      statsInserted: 0,
      errors: [] as string[],
    };

    // Process each player
    for (const player of doc.players) {
      if (!player.odlierId) {
        results.errors.push(`Skipped ${player.name}: not a registered user`);
        continue;
      }

      // 1. Save session stats to season_player_stats (including RP)
      const { error: statsError } = await supabase
        .from('season_player_stats')
        .insert({
          season_id: seasonId,
          user_id: player.odlierId,
          session_id: sessionId,
          games: player.games,
          total_damage: player.totalDamage,
          total_kills: player.totalKills,
          one_k_games: player.oneKGames,
          two_k_games: player.twoKGames,
          donuts: player.donuts,
          total_rp: player.totalRP,
        });

      if (statsError) {
        console.error(`Failed to save stats for ${player.name}:`, statsError);
        results.errors.push(`Failed to save stats for ${player.name}`);
      } else {
        results.statsInserted++;
      }

      // 2. Auto-register player to season if not already registered
      const { data: existingSeasonPlayer } = await supabase
        .from('season_players')
        .select('season_id')
        .eq('season_id', seasonId)
        .eq('user_id', player.odlierId)
        .maybeSingle();

      if (!existingSeasonPlayer) {
        const { error: registerError } = await supabase
          .from('season_players')
          .insert({
            season_id: seasonId,
            user_id: player.odlierId,
          });

        if (registerError && registerError.code !== '23505') {
          console.error(`Failed to register ${player.name}:`, registerError);
        }
      }
    }

    // 4. Post to Discord if requested
    let discordPosted = false;
    if (postToDiscord) {
      try {
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        
        if (!webhookUrl) {
          results.errors.push('Discord webhook not configured');
        } else {
          const avgPlacement = doc.sessionGames > 0 
            ? (doc.totalPlacement / doc.sessionGames).toFixed(1) 
            : '0';
          
          const lines: string[] = [
            `**Apex Session Summary — Season ${session.season_number}**`,
            `Games: ${doc.sessionGames} | Wins: ${doc.wins} | Avg Placement: ${avgPlacement}`,
            '',
          ];

          doc.players.forEach((p, i) => {
            const avgDmg = p.games > 0 ? (p.totalDamage / p.games).toFixed(0) : '0';
            lines.push(`**#${i + 1} ${p.name || '(no name)'}**`);
            lines.push(`• Damage: ${p.totalDamage.toLocaleString()} (Avg: ${avgDmg})`);
            lines.push(`• Kills: ${p.totalKills}`);
            lines.push(`• 1k Games: ${p.oneKGames} | 2k Games: ${p.twoKGames}`);
            lines.push(`• Donuts: ${p.donuts}`);
            lines.push(`• Session RP: ${p.totalRP > 0 ? '+' : ''}${p.totalRP}`);
            lines.push('');
          });

          const totalSquadRP = doc.players.reduce((acc, p) => acc + p.totalRP, 0);
          lines.push(`**Squad Total RP: ${totalSquadRP > 0 ? '+' : ''}${totalSquadRP}**`);

          const discordRes = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: lines.join('\n') }),
          });

          discordPosted = discordRes.ok;
          if (!discordPosted) {
            const errText = await discordRes.text();
            console.error('Discord webhook error:', errText);
            results.errors.push('Failed to post to Discord');
          }
        }
      } catch (err) {
        console.error('Discord post error:', err);
        results.errors.push('Failed to post to Discord');
      }
    }

    return NextResponse.json({
      success: true,
      discordPosted,
      ...results,
    });
  } catch (error) {
    console.error('POST /api/end-session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
