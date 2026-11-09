import { ClinicalAccessService } from '../medical-records/clinical-access.service';
import { StorageService } from '../storage/storage.service';

describe('Stage 2 fail-closed security', () => {
  function fixture(
    grant: { revokedAt: Date | null } | null,
    hasAppointment = false,
  ) {
    const db = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ role: 'MEDICO', isActive: true }),
      },
      clinicalAccess: { findUnique: jest.fn().mockResolvedValue(grant) },
      appointment: {
        findFirst: jest
          .fn()
          .mockResolvedValue(hasAppointment ? { id: 'appointment' } : null),
      },
    };
    return { db, service: new ClinicalAccessService(db as never) };
  }
  it('rejects ADMIN, reception and missing actors before querying data', async () => {
    const { service, db } = fixture({ revokedAt: null });
    await expect(service.assertAccess('p', 'admin', 'ADMIN')).rejects.toThrow(
      'exclusivo',
    );
    await expect(
      service.assertAccess('p', 'reception', 'RECEPCION'),
    ).rejects.toThrow('exclusivo');
    await expect(
      service.assertAccess('p', undefined, 'MEDICO'),
    ).rejects.toThrow('exclusivo');
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it('requires assignment or own appointment and honors explicit denial', async () => {
    await expect(
      fixture(null).service.assertAccess('p', 'doctor', 'MEDICO'),
    ).rejects.toThrow('no está asignado');
    await expect(
      fixture(null, true).service.assertAccess('p', 'doctor', 'MEDICO'),
    ).resolves.toBeUndefined();
    await expect(
      fixture({ revokedAt: new Date() }, true).service.assertAccess(
        'p',
        'doctor',
        'MEDICO',
      ),
    ).rejects.toThrow('revocado');
  });
  it('does not download from a public bucket even when configured with a service role', async () => {
    const download = jest.fn();
    const storage = new StorageService();
    Object.assign(storage, {
      supabaseClient: {
        storage: {
          getBucket: jest.fn().mockResolvedValue({ data: { public: true } }),
          from: jest.fn().mockReturnValue({ download }),
        },
      },
    });
    await expect(storage.downloadFile('synthetic.pdf')).rejects.toThrow(
      'privado',
    );
    expect(download).not.toHaveBeenCalled();
  });
});
