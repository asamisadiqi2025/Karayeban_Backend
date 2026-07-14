import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
// مثال: @Roles('ADMIN', 'MANAGER')
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);