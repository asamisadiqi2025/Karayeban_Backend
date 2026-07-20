import { BadRequestException } from '@nestjs/common';
import {
  PaginationQuery,
  PaginationResult,
} from './pagination.interface';

export function createPagination(
  query: PaginationQuery,
  maxLimit = 100,
): PaginationResult {
  const page = Math.floor(Number(query.page) || 1);
  const limit = Math.floor(Number(query.limit) || 10);

  if (page < 1) {
    throw new BadRequestException('Page must be greater than 0.');
  }

  if (limit < 1) {
    throw new BadRequestException('Limit must be greater than 0.');
  }

  if (limit > maxLimit) {
    throw new BadRequestException(
      `Limit cannot exceed ${maxLimit}.`,
    );
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}