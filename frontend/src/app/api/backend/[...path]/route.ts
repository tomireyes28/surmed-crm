import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
const COOKIE = 'surmed-session';
const MODULES = new Set([
  'auth',
  'users',
  'patients',
  'appointments',
  'medical-records',
  'specialties',
  'invoices',
  'inventory',
  'dashboard-stats',
  'audit-logs',
]);

async function boundedBody(
  request: NextRequest,
): Promise<Uint8Array | undefined> {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const limit = request.headers
    .get('content-type')
    ?.startsWith('multipart/form-data')
    ? 11 * 1024 * 1024
    : 256 * 1024;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('PAYLOAD_LIMIT');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (
    !MODULES.has(path[0]) ||
    path.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))
  )
    return NextResponse.json(
      { message: 'Ruta no disponible.' },
      { status: 404 },
    );
  if (!['GET', 'HEAD'].includes(request.method)) {
    // All browser mutations require same-origin fetch + a non-simple header.
    const expectedOrigin =
      process.env.APP_ORIGIN ||
      (process.env.NODE_ENV !== 'production'
        ? `${request.nextUrl.protocol}//${request.headers.get('host')}`
        : undefined);
    if (!expectedOrigin)
      return NextResponse.json(
        { message: 'Origen público no configurado.' },
        { status: 503 },
      );
    if (
      request.headers.get('origin') !== new URL(expectedOrigin).origin ||
      request.headers.get('x-surmed-request') !== '1'
    )
      return NextResponse.json(
        { message: 'Origen no autorizado.' },
        { status: 403 },
      );
  }
  const endpoint = path.join('/');
  const publicRoute =
    endpoint === 'auth/login' || endpoint === 'auth/recovery/redeem';
  const token = request.cookies.get(COOKIE)?.value;
  if (!publicRoute && !token)
    return NextResponse.json({ message: 'Inicie sesión.' }, { status: 401 });
  const headers = new Headers();
  for (const name of ['content-type', 'idempotency-key']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (token && !publicRoute) headers.set('authorization', `Bearer ${token}`);
  const base =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3000';
  try {
    const response = await fetch(
      `${base.replace(/\/$/, '')}/${endpoint}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        cache: 'no-store',
        redirect: 'manual',
        body: ['GET', 'HEAD'].includes(request.method)
          ? undefined
          : ((await boundedBody(request)) as BodyInit),
        signal: AbortSignal.timeout(30000),
      },
    );
    let result: NextResponse;
    if (endpoint === 'auth/login' && response.ok) {
      const data = await response.json();
      if (typeof data.backendToken !== 'string')
        throw new Error('Invalid login response');
      const payload = JSON.parse(
        Buffer.from(data.backendToken.split('.')[1], 'base64url').toString(),
      );
      result = NextResponse.json({ user: data.user });
      result.cookies.set(COOKIE, data.backendToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        expires: new Date(payload.exp * 1000),
      });
      result.cookies.delete('token'); // Retire legacy JS-readable cookies.
    } else {
      result = new NextResponse(response.body, {
        status: response.status,
        headers: {
          'content-type':
            response.headers.get('content-type') || 'application/json',
          ...(response.headers.get('content-disposition')
            ? {
                'content-disposition': response.headers.get(
                  'content-disposition',
                )!,
              }
            : {}),
        },
      });
    }
    if (
      (endpoint === 'auth/logout' && response.ok) ||
      (endpoint === 'auth/change-password' && response.ok) ||
      (!publicRoute && response.status === 401)
    )
      result.cookies.delete(COOKIE);
    result.headers.set('cache-control', 'no-store');
    result.headers.set('x-content-type-options', 'nosniff');
    result.headers.set('referrer-policy', 'no-referrer');
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === 'PAYLOAD_LIMIT')
      return NextResponse.json(
        { message: 'El archivo excede el límite permitido.' },
        { status: 413 },
      );
    return NextResponse.json(
      {
        message:
          'No se pudo confirmar la operación con el servidor. Reintente; su sesión no fue cerrada automáticamente.',
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
