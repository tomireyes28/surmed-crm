import { CLINIC_TIMEZONE } from './format';

// Calendar Dates represent clinic wall-clock fields only. Never send these
// presentation values as instants; writes keep the original appointment date.
export function toClinicCalendarDate(instant: string | Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return new Date(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
}

export function getCalendarRange(
  date: Date,
  view: string,
): { from: string; to: string } {
  let start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let end: Date;
  if (view === 'month') {
    start = new Date(date.getFullYear(), date.getMonth(), 1);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end = new Date(start);
    end.setDate(end.getDate() + 42);
  } else if (view === 'week' || view === 'work_week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end = new Date(start);
    end.setDate(end.getDate() + (view === 'work_week' ? 5 : 7));
  } else {
    end = new Date(start);
    end.setDate(end.getDate() + (view === 'agenda' ? 30 : 1));
  }
  const midnight = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00-03:00`;
  return {
    from: midnight(start),
    to: new Date(new Date(midnight(end)).getTime() - 1).toISOString(),
  };
}
