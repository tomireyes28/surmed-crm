import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export function idempotencyKey(
  body?: string,
  header?: string,
): string | undefined {
  const a = body?.trim();
  const b = header?.trim();
  if (a && b && a !== b)
    throw new BadRequestException('Las claves de idempotencia no coinciden.');
  const key = a || b;
  if (key && key.length > 120)
    throw new BadRequestException(
      'La clave de idempotencia excede 120 caracteres.',
    );
  return key;
}

// Payloads are constructed explicitly in a fixed order by each operation.
export function fingerprint(
  operation: string,
  actorId: string | undefined,
  payload: unknown,
): string {
  return createHash('sha256')
    .update(JSON.stringify([operation, actorId ?? null, payload]))
    .digest('hex');
}

export function assertReplay(
  stored: string | null | undefined,
  expected: string,
): void {
  if (!stored || stored !== expected) {
    throw new ConflictException(
      'La clave ya fue utilizada con otro contenido o usuario, o corresponde a una operación anterior sin huella verificable.',
    );
  }
}
