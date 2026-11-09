import { assertNewPassword, assertPasswordByteLimit } from './password-policy';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MedicalRecordsService } from '../medical-records/medical-records.service';

describe('Critical security regressions', () => {
  const oversized = 'á'.repeat(37); // 37 characters, 74 UTF-8 bytes

  it('accepts the exact bcrypt byte boundary and rejects multibyte truncation', () => {
    expect(() => assertNewPassword('á'.repeat(36))).not.toThrow();
    expect(() => assertNewPassword(oversized)).toThrow('72 bytes');
    expect(() => assertPasswordByteLimit('a'.repeat(73))).toThrow('72 bytes');
    expect(() => assertNewPassword('short')).toThrow('8 caracteres');
  });

  it('rejects oversized login passwords before querying credentials', async () => {
    const prisma = { user: { findUnique: jest.fn() } };
    const auth = new AuthService(prisma as never, {} as never, {} as never);
    await expect(
      auth.login({ email: 'test@example.invalid', password: oversized }),
    ).rejects.toThrow('72 bytes');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects oversized password changes without updating or revoking accounts', async () => {
    const prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    const auth = new AuthService(prisma as never, {} as never, {} as never);
    await expect(
      auth.changePassword('user', {
        currentPassword: 'Existing2026!',
        newPassword: oversized,
      }),
    ).rejects.toThrow('72 bytes');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects oversized initial and admin-reset passwords without writing them', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const users = new UsersService(prisma as never);
    await expect(
      users.create({
        email: 'test@example.invalid',
        name: 'Prueba',
        role: 'MEDICO',
        password: oversized,
      }),
    ).rejects.toThrow('72 bytes');
    await expect(users.update('user', { password: oversized })).rejects.toThrow(
      '72 bytes',
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  function clinicalFixture(parentPatientId?: string) {
    const prisma = {
      patient: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'patient', isActive: true }),
      },
      medicalRecord: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            parentPatientId
              ? { id: 'parent', patientId: parentPatientId }
              : null,
          ),
        create: jest.fn().mockResolvedValue({ id: 'record' }),
      },
    };
    const storage = { uploadValidatedFile: jest.fn() };
    return {
      prisma,
      storage,
      service: new MedicalRecordsService(prisma as never, storage as never),
    };
  }

  it.each([undefined, 'other-patient'])(
    'rejects missing/cross-patient parent (%s) before upload or persistence',
    async (parentPatientId) => {
      const { service, prisma, storage } = clinicalFixture(parentPatientId);
      await expect(
        service.create(
          {
            patientId: 'patient',
            parentRecordId: 'parent',
            notes: 'Nota sintética',
          },
          'doctor',
          {} as Express.Multer.File,
        ),
      ).rejects.toThrow('no pertenece');
      expect(prisma.medicalRecord.create).not.toHaveBeenCalled();
      expect(storage.uploadValidatedFile).not.toHaveBeenCalled();
    },
  );

  it('preserves creation linked to the same patient', async () => {
    const { service, prisma } = clinicalFixture('patient');
    await expect(
      service.create(
        {
          patientId: 'patient',
          parentRecordId: 'parent',
          notes: 'Nota sintética',
        },
        'doctor',
      ),
    ).resolves.toEqual({ id: 'record' });
    expect(prisma.medicalRecord.create).toHaveBeenCalledWith({
      data: {
        patientId: 'patient',
        parentRecordId: 'parent',
        doctorId: 'doctor',
        notes: 'Nota sintética',
        attachments: [],
      },
      include: { doctor: { select: { id: true, name: true, email: true } } },
    });
  });
});
