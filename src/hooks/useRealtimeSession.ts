'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

type UseRealtimeSessionOptions = {
  sessionId: string | null;
  onPlayersChange: () => void;
  onGamesChange: () => void;
  onStatsChange: () => void;
  onConnectionChange?: (connected: boolean) => void;
};

export function useRealtimeSession({
  sessionId,
  onPlayersChange,
  onGamesChange,
  onStatsChange,
}: UseRealtimeSessionOptions) {
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const [isConnected, setIsConnected] = useState(true);

  const cleanup = useCallback(() => {
    channelsRef.current.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];
  }, []);

  useEffect(() => {
    if (!sessionId) {
      cleanup();
      return;
    }

    // Subscribe to live_session_players changes
    const playersChannel = supabase
      .channel(`realtime-players-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_session_players',
          filter: `live_session_id=eq.${sessionId}`,
        },
        () => {
          onPlayersChange();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
        }
        // Silently handle other statuses - no warnings
      });

    // Subscribe to game_stats changes
    const gamesChannel = supabase
      .channel(`realtime-games-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_stats',
          filter: `live_session_id=eq.${sessionId}`,
        },
        () => {
          onGamesChange();
        }
      )
      .subscribe();

    // Subscribe to player_game_stats changes
    const statsChannel = supabase
      .channel(`realtime-stats-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player_game_stats',
        },
        () => {
          onStatsChange();
        }
      )
      .subscribe();

    channelsRef.current = [playersChannel, gamesChannel, statsChannel];

    return () => {
      cleanup();
    };
  }, [sessionId, onPlayersChange, onGamesChange, onStatsChange, cleanup]);

  return { isConnected };
}
