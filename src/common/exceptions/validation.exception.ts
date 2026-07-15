import { BadRequestException } from '@nestjs/common';

export class ValidationException extends BadRequestException {
  constructor(errors: Record<string, string>) {
    super({
      success: false,
      statusCode: 400,
      message: 'اطلاعات وارد شده معتبر نیست.',
      errors,
    });
  }
}