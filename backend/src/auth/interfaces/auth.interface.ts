import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface RequestWithUser {
  ip?: string;
  user?: {
    id: string;
    name?: string;
    email: string;
    role: Role;
    jti?: string;
  };
}
