import { BadRequestException } from '@nestjs/common';

/** bcrypt only uses the first 72 UTF-8 bytes, not 72 characters. */
export function assertPasswordByteLimit(password: string): void {
  if (
    typeof password !== 'string' ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new BadRequestException(
      'La contraseña no puede superar los 72 bytes UTF-8.',
    );
  }
}

export function assertNewPassword(password: string): void {
  assertPasswordByteLimit(password);
  if (password.trim().length < 8) {
    throw new BadRequestException(
      'La contraseña debe tener al menos 8 caracteres.',
    );
  }
}
