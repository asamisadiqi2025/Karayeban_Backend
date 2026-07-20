import { ForbiddenException } from '@nestjs/common';
import { UserStatus } from 'src/generated/prisma/enums';

export function ensureUserIsActive(status: UserStatus): void {
  switch (status) {
    case UserStatus.ACTIVE:
      return;

    case UserStatus.INACTIVE:
      throw new ForbiddenException(
        'حساب کاربری غیرفعال است. لطفاً با پشتیبانی تماس بگیرید.',
      );

    case UserStatus.BLOCKED:
      throw new ForbiddenException(
        'حساب کاربری مسدود شده است. لطفاً با پشتیبانی تماس بگیرید.',
      );

    default:
      throw new ForbiddenException(
        'وضعیت حساب کاربری نامعتبر است.',
      );
  }
}