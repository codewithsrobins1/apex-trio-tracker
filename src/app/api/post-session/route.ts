import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Generate a unique 6-digit code
async function generateUniqueCode(supabase: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const maxAttempts = 10;
  
  for (let i = 0; i < maxAttempts; i++) {
    // Generate random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Check if it already exists
    const { data } = await supabase
      .from('sessions')
      .select('id')
      .eq('session_code', code)
      .maybeSingle();
    
    if (!data) {
      return code;
    }
  }
  
  throw new Error('Failed to generate unique session code');
}

// GET - Lookup session by code
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { error: 'Missing session code' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: session, error } = await supabase
      .from('sessions')
      .select('id, session_code, season_number, host_user_id, doc, created_at, updated_at')
      .eq('session_code', code)
      .maybeSingle();

    if (error) {
      console.error('Failed to lookup session:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('GET /api/post-session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { seasonNumber, hostUserId, doc } = body;

    if (!seasonNumber || !doc) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const sessionId = crypto.randomUUID();
    const writeKey = crypto.randomUUID();
    const sessionCode = await generateUniqueCode(supabase);

    const { error } = await supabase.from('sessions').insert({
      id: sessionId,
      season_number: seasonNumber,
      host_user_id: hostUserId,
      write_key: writeKey,
      session_code: sessionCode,
      doc,
    });

    if (error) {
      console.error('Failed to create session:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessionId, writeKey, sessionCode });
  } catch (error) {
    console.error('POST /api/post-session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update existing session
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, writeKey, doc, playerIdUpdating } = body;

    if (!sessionId || !doc) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Fetch the session
    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('write_key')
      .eq('id', sessionId)
      .maybeSingle();

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Check authorization
    const isHost = writeKey && session.write_key === writeKey;
    const isPlayerUpdatingOwnRP = playerIdUpdating && !isHost;

    // Allow update if:
    // 1. User is host (has valid writeKey) OR
    // 2. User is a player updating their own RP (has playerIdUpdating)
    if (!isHost && !isPlayerUpdatingOwnRP) {
      return NextResponse.json({ error: 'Invalid write key' }, { status: 403 });
    }

    // Update session
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ doc, updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Failed to update session:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/post-session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
