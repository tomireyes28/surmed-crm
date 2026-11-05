const INSECURE_SECRETS = new Set([
  'SUPER_SECRET_KEY_SURMED',
  'secret',
  'changeme',
  '123456',
]);

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const nodeEnv = typeof config.NODE_ENV === 'string' && config.NODE_ENV.trim()
    ? config.NODE_ENV.trim()
    : 'development';

  const jwtSecret = typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET.trim() : '';
  if (!jwtSecret || jwtSecret.length < 16 || INSECURE_SECRETS.has(jwtSecret)) {
    throw new Error(
      'Configuración inválida: JWT_SECRET es obligatorio, no puede ser un valor por defecto conocido y debe tener al menos 16 caracteres.',
    );
  }

  const databaseUrl = typeof config.DATABASE_URL === 'string' ? config.DATABASE_URL.trim() : '';
  if (!databaseUrl && nodeEnv !== 'test') {
    throw new Error('Configuración inválida: DATABASE_URL es obligatorio.');
  }

  const rawPort = config.PORT !== undefined && config.PORT !== '' ? Number(config.PORT) : 3000;
  if (!Number.isInteger(rawPort) || rawPort <= 0 || rawPort > 65535) {
    throw new Error('Configuración inválida: PORT debe ser un entero entre 1 y 65535.');
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    JWT_SECRET: jwtSecret,
    DATABASE_URL: databaseUrl,
    PORT: rawPort,
    JWT_EXPIRES_IN:
      typeof config.JWT_EXPIRES_IN === 'string' && config.JWT_EXPIRES_IN.trim()
        ? config.JWT_EXPIRES_IN.trim()
        : '8h',
    CORS_ORIGINS:
      typeof config.CORS_ORIGINS === 'string' && config.CORS_ORIGINS.trim()
        ? config.CORS_ORIGINS.trim()
        : 'http://localhost:3000,http://localhost:3001',
  };
}
