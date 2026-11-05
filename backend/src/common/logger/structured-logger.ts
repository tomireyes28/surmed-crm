const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'token',
  'access_token',
  'refreshtoken',
  'authorization',
  'cookie',
  'set-cookie',
  'notes',
  'jwt_secret',
  'supabase_service_role_key',
  'database_url',
]);

/**
 * Redacta recursivamente campos sensibles (contraseñas, tokens, notas clínicas, secretos)
 * antes de emitir un evento de log o de persistir metadatos de auditoría (T12 / S08).
 */
export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    // Redactar posibles JWT embebidos en texto
    return value.replace(
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
      '[REDACTED_JWT]',
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSensitiveData(v, depth + 1);
      }
    }
    return out;
  }

  return value;
}

export interface StructuredLogEntry {
  level: 'INFO' | 'WARN' | 'ERROR';
  event: string;
  requestId?: string;
  actorId?: string;
  actorRole?: string;
  resource?: string;
  resourceId?: string;
  statusCode?: number;
  context?: Record<string, unknown>;
}

export function formatStructuredLog(entry: StructuredLogEntry): string {
  const payload = {
    timestamp: new Date().toISOString(),
    level: entry.level,
    event: entry.event,
    ...(entry.requestId ? { requestId: entry.requestId } : {}),
    ...(entry.actorId ? { actorId: entry.actorId } : {}),
    ...(entry.actorRole ? { actorRole: entry.actorRole } : {}),
    ...(entry.resource ? { resource: entry.resource } : {}),
    ...(entry.resourceId ? { resourceId: entry.resourceId } : {}),
    ...(entry.statusCode !== undefined ? { statusCode: entry.statusCode } : {}),
    ...(entry.context
      ? {
          context: redactSensitiveData(entry.context) as Record<
            string,
            unknown
          >,
        }
      : {}),
  };

  return JSON.stringify(payload);
}
