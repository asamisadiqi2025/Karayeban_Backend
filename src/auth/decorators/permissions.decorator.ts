import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
// مثال: @Permissions('shop.create', 'shop.update')
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);