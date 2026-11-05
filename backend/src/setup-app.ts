import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { GlobalExceptionFilter } from './common/filters/prisma-exception.filter';

/**
 * Verifica que una URL de base de datos empleada en pruebas E2E corresponda
 * explícitamente a una base descartable identificada como `test` (Fase 5).
 */
export function assertDisposableTestDatabaseUrl(databaseUrl?: string): void {
  if (!databaseUrl || typeof databaseUrl !== 'string') {
    throw new Error(
      'Se requiere una URL de base de datos de prueba explícita para ejecutar la suite E2E.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      'La URL de base de datos de prueba no tiene un formato URI válido.',
    );
  }

  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
  const schemaParam = (parsed.searchParams.get('schema') ?? '').toLowerCase();

  if (!dbName.includes('test') && !schemaParam.includes('test')) {
    throw new Error(
      `Ejecución E2E abortada por seguridad: la base de datos "${dbName || '(vacía)'}" no está identificada explícitamente como entorno descartable ("test").`,
    );
  }
}

/**
 * Configura una instancia de NestJS con los mismos pipes, filtros, cabeceras de seguridad,
 * correlación `X-Request-Id`, CORS y hooks de cierre que el servidor real (`main.ts`).
 * Reutilizado tanto en producción como en el bootstrap de aceptación E2E (Fase 5).
 */
export function configureApp(app: INestApplication): INestApplication {
  const configService = app.get(ConfigService, { strict: false });

  // Cierre ordenado de conexiones y pools ante señales de terminación (SIGTERM / SIGINT) (T12)
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  // Cabeceras de seguridad, prevención de caché de datos sensibles y correlación de petición
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incomingReqId = req.headers['x-request-id'];
    const requestId =
      typeof incomingReqId === 'string' && incomingReqId.trim().length > 0
        ? incomingReqId.trim().slice(0, 64)
        : crypto.randomUUID();

    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const rawOrigins =
    configService?.get<string>('CORS_ORIGINS') ??
    process.env.CORS_ORIGINS ??
    'http://localhost:3000,http://localhost:3001';
  const allowedOrigins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Request-Id',
    ],
  });

  return app;
}
