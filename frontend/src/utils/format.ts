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

/**
 * Extrae las partes civiles (año, mes 1-12, día 1-31) de una fecha de nacimiento
 * evitando desplazamientos horarios UTC -> local (`F07` / `F20`).
 */
export function extractCivilBirthDateParts(
  birthDateInput: string | Date,
): { year: number; month: number; day: number } | null {
  if (!birthDateInput) return null;

  if (typeof birthDateInput === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDateInput.trim());
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      };
    }
  }

  const parsed =
    typeof birthDateInput === 'string'
      ? new Date(birthDateInput)
      : birthDateInput;
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  };
}

/**
 * Convierte una fecha de nacimiento en formato `YYYY-MM-DD` para inputs `<input type="date">`.
 */
export function formatCivilBirthDateInput(
  birthDateInput: string | Date,
): string {
  const parts = extractCivilBirthDateParts(birthDateInput);
  if (!parts) return '';
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${parts.year}-${mm}-${dd}`;
}

/**
 * Calcula la edad civil exacta de un paciente en `America/Asuncion` (`F20`).
 * Descuenta 1 año si aún no se cumplió el mes/día del cumpleaños en el año en curso,
 * incluyendo soporte explícito para nacidos el 29 de febrero.
 */
export function calculateCivilAge(
  birthDateInput: string | Date,
  referenceDate: Date = new Date(),
): number {
  const birth = extractCivilBirthDateParts(birthDateInput);
  if (!birth) return 0;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const refParts = formatter.formatToParts(referenceDate);
  const getPart = (type: string) =>
    Number(refParts.find((p) => p.type === type)?.value ?? 0);

  const refYear = getPart('year');
  const refMonth = getPart('month');
  const refDay = getPart('day');

  let age = refYear - birth.year;

  // Para nacidos el 29/02 en años no bisiestos, el cumpleaños civil se considera cumplido el 01/03
  const hasHadBirthdayThisYear =
    refMonth > birth.month ||
    (refMonth === birth.month && refDay >= birth.day);

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return Math.max(0, age);
}
