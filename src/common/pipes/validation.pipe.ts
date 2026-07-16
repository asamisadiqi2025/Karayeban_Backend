import { ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { ValidationException } from '../exceptions/validation.exception';

export const AppValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  stopAtFirstError: true,

  exceptionFactory: (validationErrors: ValidationError[]) => {
    const errors: Record<string, string> = {};

    for (const error of validationErrors) {
      if (error.constraints) {
        errors[error.property] = Object.values(error?.constraints)[0];
      }
    }

    return new ValidationException(errors);
  },
});