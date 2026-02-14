import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pin } = body;

    // Get PIN from environment variable
    const correctPin = process.env.SITE_ACCESS_PIN;

    if (!correctPin) {
      console.error('SITE_ACCESS_PIN environment variable not set');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (!pin) {
      return NextResponse.json(
        { error: 'PIN is required' },
        { status: 400 }
      );
    }

    if (pin !== correctPin) {
      return NextResponse.json(
        { error: 'Invalid PIN' },
        { status: 401 }
      );
    }

    // PIN is correct - set cookie
    const response = NextResponse.json({ success: true });

    // Set cookie - don't use secure on localhost
    const isProduction = process.env.NODE_ENV === 'production';
    
    response.cookies.set({
      name: 'site_access',
      value: 'granted',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
      // Don't set domain for localhost
    });

    console.log('PIN verified, cookie set, production:', isProduction);
    return response;
  } catch (err) {
    console.error('verify-pin error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
