import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Buscamos la cookie que acabamos de setear en el login
  const token = request.cookies.get('token')?.value;

  // Si no hay token y quiere entrar a cualquier ruta protegida (dashboard)
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Si ya hay token y está en la pantalla de login (la raíz)
  if (token && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

// Acá le decimos al middleware en qué rutas específicas tiene que ejecutarse
export const config = {
  matcher: ['/', '/dashboard/:path*'],
};