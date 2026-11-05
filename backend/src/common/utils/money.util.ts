import { Prisma } from '@prisma/client';

/**
 * Convierte un valor numérico, string o Prisma.Decimal a número exacto con hasta 2 decimales.
 * Evita errores de punto flotante IEEE-754 trabajando en centavos enteros.
 */
export function toMoneyNumber(
  value: Prisma.Decimal | number | string | null | undefined,
): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (value instanceof Prisma.Decimal) {
    return Number(value.toFixed(2));
  }
  const num = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Convierte un importe a centavos enteros para sumas y multiplicaciones exactas.
 */
export function toCents(
  value: Prisma.Decimal | number | string | null | undefined,
): number {
  return Math.round(toMoneyNumber(value) * 100);
}

/**
 * Convierte centavos enteros a Prisma.Decimal(12, 2).
 */
export function centsToDecimal(cents: number): Prisma.Decimal {
  const fixed = (Math.round(cents) / 100).toFixed(2);
  return new Prisma.Decimal(fixed);
}

/**
 * Convierte un número o string a Prisma.Decimal(12, 2).
 */
export function toDecimal(value: number | string): Prisma.Decimal {
  return centsToDecimal(toCents(value));
}

/**
 * Calcula subtotal exacto (`quantity * unitPrice`) en centavos y devuelve tanto Decimal como número.
 */
export function calculateItemSubtotal(
  quantity: number,
  unitPrice: number | Prisma.Decimal,
): { decimal: Prisma.Decimal; number: number; cents: number } {
  const unitCents = toCents(unitPrice);
  const subtotalCents = quantity * unitCents;
  const decimal = centsToDecimal(subtotalCents);
  return {
    decimal,
    number: Number(decimal.toFixed(2)),
    cents: subtotalCents,
  };
}
