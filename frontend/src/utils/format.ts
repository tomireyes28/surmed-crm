export const CLINIC_TIMEZONE = 'America/Asuncion';
export const CLINIC_LOCALE = 'es-PY';

/**
 * Formatea un monto en Guaraníes (PYG / es-PY).
 * Si el monto tiene decimales no nulos los conserva; si es entero muestra sin decimales.
 */
export function formatPYG(amount: number | null | undefined): string {
  const safeAmount = Number(amount ?? 0);
  if (!Number.isFinite(safeAmount)) {
    return 'Gs. 0';
  }
  const hasDecimals = Math.abs(safeAmount % 1) > 0.001;
  return new Intl.NumberFormat(CLINIC_LOCALE, {
    style: 'currency',
    currency: 'PYG',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(safeAmount);
}

/**
 * Formatea fecha y hora en el huso horario del centro (`America/Asuncion`).
 */
export function formatClinicTime(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat(CLINIC_LOCALE, {
    timeZone: CLINIC_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Formatea fecha corta (`dd/mm/yyyy`) en el huso horario del centro (`America/Asuncion`).
 */
export function formatClinicDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat(CLINIC_LOCALE, {
    timeZone: CLINIC_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
