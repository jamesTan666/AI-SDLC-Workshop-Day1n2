import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PROTECTED_PATHS = ['/', '/calendar'];

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('session')?.value;
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return typeof payload.userId === 'number';
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authenticated = await isAuthenticated(request);

  if (PROTECTED_PATHS.includes(pathname) && !authenticated) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (pathname === '/login' && authenticated) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/calendar', '/login'],
};
