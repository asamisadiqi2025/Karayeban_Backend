import { ForbiddenException } from '@nestjs/common';
import { UserStatus } from '../../generated/prisma/enums';

export function ensureUserIsActive(status: UserStatus | string): void {
  if (status === UserStatus.ACTIVE) {
    return;
  }

  if (status === UserStatus.INACTIVE) {
    throw new ForbiddenException(
      'Account is inactive. Please contact support.',
    );
  }

  if (status === UserStatus.BLOCKED) {
    throw new ForbiddenException(
      'Account is blocked. Please contact support.',
    );
  }

  throw new ForbiddenException('Invalid account status.');
}
