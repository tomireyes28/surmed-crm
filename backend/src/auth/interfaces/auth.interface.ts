import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface RequestWithUser {
  user?: {
    id: string;
    email: string;
    role: Role;
  };
}