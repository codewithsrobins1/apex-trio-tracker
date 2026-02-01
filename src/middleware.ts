import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require PIN
const PUBLIC_ROUTES = ['/gate', '/api/verify-pin'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check for access cookie
  const accessCookie = request.cookies.get('site_access');

  if (!accessCookie || accessCookie.value !== 'granted') {
    // Redirect to gate page
    const gateUrl = new URL('/gate', request.url);
    gateUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(gateUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
