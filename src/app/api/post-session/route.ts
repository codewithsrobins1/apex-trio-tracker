import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

// POST - Create new session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { seasonNumber, hostUserId, doc } = body;

    if (!seasonNumber || !doc) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const sessionId = crypto.randomUUID();
    const writeKey = crypto.randomUUID();

    const { error } = await supabase.from('sessions').insert({
      id: sessionId,
      season_number: seasonNumber,
      host_user_id: hostUserId,
      write_key: writeKey,
      doc,
    });

    if (error) {
      console.error('Failed to create session:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessionId, writeKey });
  } catch (error) {
    console.error('POST /api/post-session error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update existing session
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, writeKey, doc } = body;

    if (!sessionId || !doc) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Verify write key
    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('write_key')
      .eq('id', sessionId)
      .maybeSingle();

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.write_key !== writeKey) {
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
