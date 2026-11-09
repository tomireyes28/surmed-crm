import {
  parseCivilDate,
  parseClinicDateTime,
} from './common/utils/timezone.util';
import { AppointmentsService } from './appointments/appointments.service';

describe('Stage 3 date and query boundaries', () => {
  it.each([
    '2026-02-30T09:00',
    '2026-11-08T24:00',
    '2026-11-08T09:60',
    '2026-11-08T09:00+14:30',
    '2026-11-08garbage',
  ])('rejects invalid date rather than JS normalization: %s', (input) => {
    expect(() => parseClinicDateTime(input)).toThrow();
  });
  it('rejects civil suffixes and preserves valid leap dates', () => {
    expect(() => parseCivilDate('2000-02-29garbage')).toThrow();
    expect(parseCivilDate('2000-02-29').toISOString()).toBe(
      '2000-02-29T12:00:00.000Z',
    );
    expect(parseClinicDateTime('2026-11-08T09:00').toISOString()).toBe(
      '2026-11-08T12:00:00.000Z',
    );
  });
  it('rejects one-sided, reversed or excessive ranges before querying', async () => {
    const db = { appointment: { findMany: jest.fn() } };
    const service = new AppointmentsService(db as never);
    await expect(
      service.findAll({ from: '2026-11-01T00:00' }),
    ).rejects.toThrow();
    await expect(
      service.findAll({ from: '2026-11-08T00:00', to: '2026-11-01T00:00' }),
    ).rejects.toThrow();
    await expect(
      service.findAll({ from: '2026-01-01T00:00', to: '2026-12-01T00:00' }),
    ).rejects.toThrow();
    expect(db.appointment.findMany).not.toHaveBeenCalled();
  });
  it('returns an explicit error instead of silently truncating an overloaded agenda', async () => {
    const db = {
      appointment: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            Array.from({ length: 2001 }, () => ({ id: 'synthetic' })),
          ),
      },
    };
    await expect(
      new AppointmentsService(db as never).findAll(),
    ).rejects.toThrow('2000');
  });
});
