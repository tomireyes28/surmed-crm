import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

import { RequestWithUser } from '../interfaces/auth.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredRoles) {
      return true;
    }
    
    // 2. Le inyectamos la interfaz a getRequest para que deje de ser 'any'
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    
    // 3. Validación de seguridad extra por si el JWT falló
    if (!user) {
      return false;
    }
    
    return requiredRoles.some((role) => user.role === role);
  }
}