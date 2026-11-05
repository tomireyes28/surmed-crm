import { BadRequestException } from '@nestjs/common';

/**
 * Parsea y valida estrictamente un parámetro entero positivo de query string (`F13`).
 * Rechaza cadenas parciales como `'10abc'`, valores cero, negativos o fuera de rango.
 */
export function parsePositiveIntQuery(
  raw: string | number | undefined,
  fieldName: string,
  defaultValue: number,
  options: { min?: number; max?: number } = {},
): number {
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }

  const min = options.min ?? 1;
  const max = options.max ?? 100;

  const str = String(raw).trim();
  if (!/^\d+$/.test(str)) {
    throw new BadRequestException(
      `El parámetro "${fieldName}" debe ser un número entero positivo válido.`,
    );
  }

  const parsed = Number.parseInt(str, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new BadRequestException(
      `El parámetro "${fieldName}" debe estar entre ${min} y ${max}.`,
    );
  }

  return parsed;
}

/**
 * Parsea un booleano opcional de query string (`'true'` / `'false'`).
 */
export function parseBooleanQuery(
  raw: string | boolean | undefined,
  fieldName: string = 'flag',
): boolean {
  if (raw === undefined || raw === null || raw === '') {
    return false;
  }
  if (typeof raw === 'boolean') {
    return raw;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  throw new BadRequestException(
    `El parámetro "${fieldName}" debe ser "true" o "false".`,
  );
}
