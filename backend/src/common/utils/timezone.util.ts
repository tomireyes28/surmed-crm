import { BadRequestException } from '@nestjs/common';

/**
 * Zona horaria oficial del centro médico Surmed (Paraguay).
 * Los horarios operativos actuales se interpretan con offset -03:00.
 */
export const CLINIC_TIMEZONE = 'America/Asuncion';
export const CLINIC_UTC_OFFSET = '-03:00';
export const CLINIC_OFFSET_MINUTES = -180;

const ISO_WITH_OFFSET_REGEX = /(?:Z|[+-]\d{2}:\d{2})$/i;
const NAIVE_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;
const CIVIL_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Convierte una fecha/hora de entrada a un instante UTC consistente con America/Asuncion.
 * - Si trae offset explícito (`Z` o `+HH:MM` / `-HH:MM`), se respeta ese instante exacto.
 * - Si viene sin offset (ej. `2026-11-05T09:30` desde `<input type="datetime-local">`),
 *   se interpreta explícitamente en la zona del centro (`America/Asuncion`, `-03:00`),
 *   de modo que la hora agendada no dependa del huso horario del servidor ni del navegador.
 */
export function parseClinicDateTime(raw: string): Date {
  if (typeof raw !== 'string')
    throw new BadRequestException('La fecha debe ser texto ISO 8601.');
  const trimmed = raw?.trim();
  if (!trimmed) {
    throw new BadRequestException('La fecha y hora son obligatorias.');
  }

  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|([+-])(\d{2}):(\d{2}))?$/i.exec(
      trimmed,
    );
  if (!parts)
    throw new BadRequestException('Formato de fecha y hora inválido.');
  const [, y, m, d, h, min, sec, , offsetHour, offsetMinute] = parts;
  const calendar = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    Number(y) < 1900 ||
    calendar.getUTCFullYear() !== Number(y) ||
    calendar.getUTCMonth() + 1 !== Number(m) ||
    calendar.getUTCDate() !== Number(d) ||
    Number(h) > 23 ||
    Number(min) > 59 ||
    Number(sec ?? 0) > 59 ||
    Number(offsetHour ?? 0) > 14 ||
    Number(offsetMinute ?? 0) > 59 ||
    (Number(offsetHour) === 14 && Number(offsetMinute) !== 0)
  )
    throw new BadRequestException(
      'La fecha calendario, hora u offset no es válido.',
    );

  let normalized = trimmed;
  if (!ISO_WITH_OFFSET_REGEX.test(trimmed)) {
    if (!NAIVE_DATETIME_REGEX.test(trimmed)) {
      throw new BadRequestException(
        'Formato de fecha y hora inválido. Use ISO 8601 (ej. 2026-11-05T09:30:00-03:00).',
      );
    }
    const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    normalized = `${withSeconds}${CLINIC_UTC_OFFSET}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(
      'La fecha y hora proporcionadas no son válidas.',
    );
  }

  return parsed;
}

/**
 * Convierte una fecha civil (`YYYY-MM-DD` o ISO) a un Date anclado a las 12:00:00 UTC
 * de esa fecha civil, evitando que conversiones de zona horaria desplacen el día
 * de nacimiento hacia el día anterior o siguiente.
 */
export function parseCivilDate(raw: string, allowFuture = false): Date {
  if (typeof raw !== 'string')
    throw new BadRequestException('La fecha debe ser texto ISO 8601.');
  const trimmed = raw?.trim();
  if (!trimmed) {
    throw new BadRequestException('La fecha es obligatoria.');
  }

  if (trimmed.length !== 10) parseClinicDateTime(trimmed);

  const match = CIVIL_DATE_REGEX.exec(trimmed);
  if (!match) {
    throw new BadRequestException(
      'Formato de fecha civil inválido. Use YYYY-MM-DD.',
    );
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new BadRequestException('La fecha civil proporcionada no es válida.');
  }

  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (
    utcNoon.getUTCFullYear() !== year ||
    utcNoon.getUTCMonth() !== month - 1 ||
    utcNoon.getUTCDate() !== day
  ) {
    throw new BadRequestException(
      'La fecha calendario no existe (ej. 30 de febrero).',
    );
  }

  if (!allowFuture) {
    const todayInClinic = getClinicDateParts(new Date());
    const todayKey =
      todayInClinic.year * 10000 +
      todayInClinic.month * 100 +
      todayInClinic.day;
    const inputKey = year * 10000 + month * 100 + day;

    if (inputKey > todayKey) {
      throw new BadRequestException(
        'La fecha de nacimiento no puede ser una fecha futura.',
      );
    }
  }

  return utcNoon;
}

/**
 * Obtiene año, mes (1..12) y día (1..31) en la zona horaria del centro (`America/Asuncion`).
 */
export function getClinicDateParts(referenceDate: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formatted = formatter.format(referenceDate); // YYYY-MM-DD
  const [yearStr, monthStr, dayStr] = formatted.split('-');
  return {
    year: Number.parseInt(yearStr, 10),
    month: Number.parseInt(monthStr, 10),
    day: Number.parseInt(dayStr, 10),
  };
}

/**
 * Devuelve el inicio `[start, end)` del día actual en `America/Asuncion` expresado en instantes UTC.
 */
export function getClinicDayBounds(referenceDate: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const { year, month, day } = getClinicDateParts(referenceDate);
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = new Date(
    `${year}-${pad(month)}-${pad(day)}T00:00:00.000${CLINIC_UTC_OFFSET}`,
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Devuelve el rango `[start, end]` de un mes calendario completo en `America/Asuncion`.
 */
export function getClinicMonthBounds(
  year: number,
  month: number,
): { start: Date; end: Date } {
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new BadRequestException('El mes o año de filtro no es válido.');
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const start = new Date(
    `${year}-${pad(month)}-01T00:00:00.000${CLINIC_UTC_OFFSET}`,
  );

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthStart = new Date(
    `${nextYear}-${pad(nextMonth)}-01T00:00:00.000${CLINIC_UTC_OFFSET}`,
  );
  const end = new Date(nextMonthStart.getTime() - 1);

  return { start, end };
}

/**
 * Extrae partes civiles `(year, month, day)` de una fecha de nacimiento (`YYYY-MM-DD` o Date UTC).
 */
export function extractCivilBirthDateParts(
  birthDateInput: string | Date,
): { year: number; month: number; day: number } | null {
  if (!birthDateInput) return null;

  if (typeof birthDateInput === 'string') {
    const match = CIVIL_DATE_REGEX.exec(birthDateInput.trim());
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
 * Formatea una fecha de nacimiento como `YYYY-MM-DD` civil.
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
 * Calcula la edad civil exacta en `America/Asuncion` (`F20`).
 */
export function calculateCivilAge(
  birthDateInput: string | Date,
  referenceDate: Date = new Date(),
): number {
  const birth = extractCivilBirthDateParts(birthDateInput);
  if (!birth) return 0;

  const ref = getClinicDateParts(referenceDate);
  let age = ref.year - birth.year;

  const hasHadBirthdayThisYear =
    ref.month > birth.month ||
    (ref.month === birth.month && ref.day >= birth.day);

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return Math.max(0, age);
}
