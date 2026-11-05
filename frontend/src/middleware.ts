import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const VALID_ROLES = new Set(['ADMIN', 'MEDICO', 'RECEPCION']);

function hasValidJwtStructureAndExp(token?: string): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return false;
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = JSON.parse(atob(padded));

    if (
      !decoded ||
      typeof decoded.sub !== 'string' ||
      !VALID_ROLES.has(decoded.role) ||
      typeof decoded.exp !== 'number'
    ) {
      return false;
    }

    // Verificamos que no esté expirado
    if (decoded.exp * 1000 <= Date.now()) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const rawToken = request.cookies.get('token')?.value;
  const isTokenPlausible = hasValidJwtStructureAndExp(rawToken);
  const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard');
  const isLoginRoute = request.nextUrl.pathname === '/';

  // Si la cookie existe pero es inválida/expirada/inventada, la borramos para evitar bucles de redirección
  if (rawToken && !isTokenPlausible) {
    const response = isDashboardRoute
      ? NextResponse.redirect(new URL('/', request.url))
      : NextResponse.next();
    response.cookies.delete('token');
    return response;
  }

  if (!isTokenPlausible && isDashboardRoute) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (isTokenPlausible && isLoginRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dashboard/:path*'],
};
