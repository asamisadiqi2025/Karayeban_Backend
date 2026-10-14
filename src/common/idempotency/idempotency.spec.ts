import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  hashRequest,
  IDEMPOTENCY_TTL_MS,
  itemIdempotencyKey,
  parseIdempotencyKey,
  runIdempotent,
} from './idempotency';

describe('parseIdempotencyKey', () => {
  it('accepts a normal key and trims it', () => {
    expect(parseIdempotencyKey('  3f2b8c1e-aaaa-4bbb-8ccc-123456789abc ')).toBe(
      '3f2b8c1e-aaaa-4bbb-8ccc-123456789abc',
    );
    expect(parseIdempotencyKey('order_2026-10-09:abc.1')).toBe(
      'order_2026-10-09:abc.1',
    );
  });

  it('treats a missing or empty header as "not provided"', () => {
    expect(parseIdempotencyKey(undefined)).toBeUndefined();
    expect(parseIdempotencyKey('')).toBeUndefined();
    expect(parseIdempotencyKey('   ')).toBeUndefined();
  });

  it('rejects too short / too long / odd characters / a duplicated header with 400', () => {
    expect(() => parseIdempotencyKey('short')).toThrow(BadRequestException);
    expect(() => parseIdempotencyKey('x'.repeat(101))).toThrow(
      BadRequestException,
    );
    expect(() => parseIdempotencyKey('has space in it 123')).toThrow(
      BadRequestException,
    );
    expect(() => parseIdempotencyKey("bad'; DROP TABLE x;--")).toThrow(
      BadRequestException,
    );
    expect(() => parseIdempotencyKey('key-one-12345, key-two-12345')).toThrow(
      BadRequestException,
    ); // Node joins duplicate headers with ", "
    expect(() => parseIdempotencyKey(['a'.repeat(10), 'b'.repeat(10)])).toThrow(
      BadRequestException,
    );
  });
});

describe('itemIdempotencyKey', () => {
  it('derives a per-item key, and stays undefined without a request key', () => {
    expect(itemIdempotencyKey('abcdefgh', 0)).toBe('abcdefgh#0');
    expect(itemIdempotencyKey('abcdefgh', 7)).toBe('abcdefgh#7');
    expect(itemIdempotencyKey(undefined, 3)).toBeUndefined();
  });

  it('never exceeds the column size (128) for a max-length key', () => {
    expect(itemIdempotencyKey('k'.repeat(100), 9)?.length).toBeLessThanOrEqual(
      128,
    );
  });
});

describe('hashRequest', () => {
  it('is stable regardless of key order and ignores undefined fields', () => {
    expect(hashRequest({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(
      hashRequest({ b: { d: [1, 2], c: 2 }, a: 1 }),
    );
    expect(hashRequest({ a: 1, b: undefined })).toBe(hashRequest({ a: 1 }));
  });

  it('differs when any value differs (amount, contract, receipt, array order)', () => {
    const base = { contractId: 'c1', amount: 100, receiptNumber: 'R-1' };
    expect(hashRequest(base)).not.toBe(hashRequest({ ...base, amount: 101 }));
    expect(hashRequest(base)).not.toBe(
      hashRequest({ ...base, contractId: 'c2' }),
    );
    expect(hashRequest(base)).not.toBe(
      hashRequest({ ...base, receiptNumber: 'R-2' }),
    );
    expect(hashRequest([1, 2])).not.toBe(hashRequest([2, 1]));
  });

  it('treats Dates and Decimals by their JSON form', () => {
    expect(hashRequest({ at: new Date('2026-10-09T00:00:00Z') })).toBe(
      hashRequest({ at: '2026-10-09T00:00:00.000Z' }),
    );
    expect(hashRequest({ n: new Prisma.Decimal('1.50') })).toBe(
      hashRequest({ n: '1.5' }),
    );
  });
});

// ---- runIdempotent with a fake PrismaService -----------------------------------------------------
function fakePrisma() {
  const store = new Map<
    string,
    { requestHash: string; response: unknown; expiresAt: Date }
  >();
  const events: string[] = [];
  const keyOf = (w: { userId: string; scope: string; key: string }) =>
    `${w.userId}|${w.scope}|${w.key}`;
  const tx = {
    $executeRaw: async () => {
      events.push('lock');
      return 1;
    },
    idempotencyKey: {
      findUnique: async ({
        where,
      }: {
        where: {
          userId_scope_key: { userId: string; scope: string; key: string };
        };
      }) => {
        events.push('find');
        return store.get(keyOf(where.userId_scope_key)) ?? null;
      },
      create: async ({
        data,
      }: {
        data: {
          userId: string;
          scope: string;
          key: string;
          requestHash: string;
          response: unknown;
          expiresAt: Date;
        };
      }) => {
        events.push('create');
        store.set(keyOf(data), {
          requestHash: data.requestHash,
          response: data.response,
          expiresAt: data.expiresAt,
        });
        return data;
      },
    },
  };
  const prisma = {
    $transaction: async (fn: (t: unknown) => unknown) => {
      events.push('tx-begin');
      const snapshot = new Map(store);
      try {
        const r = await fn(tx);
        events.push('tx-commit');
        return r;
      } catch (e) {
        // emulate rollback: nothing written inside the failed transaction survives
        store.clear();
        for (const [k, v] of snapshot) store.set(k, v);
        events.push('tx-rollback');
        throw e;
      }
    },
  };
  return { prisma: prisma as unknown as PrismaService, store, events };
}

const base = { userId: 'u1', scope: 'RENT_PAYMENT', requestHash: 'h1' };

describe('runIdempotent', () => {
  it('without a key it is just a plain transaction (no lock, no key row): old behavior', async () => {
    const { prisma, events, store } = fakePrisma();
    const work = jest.fn(async () => ({ id: 'p1' }));
    const r = await runIdempotent(prisma, { ...base, key: undefined, work });
    expect(r).toEqual({ id: 'p1' });
    expect(work).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['tx-begin', 'tx-commit']);
    expect(store.size).toBe(0);
  });

  it('first call: locks, finds nothing, runs the work and stores the key IN THE SAME transaction', async () => {
    const { prisma, events, store } = fakePrisma();
    const work = jest.fn(async () => ({
      id: 'p1',
      amount: new Prisma.Decimal('100.5'),
      at: new Date('2026-10-09T00:00:00Z'),
    }));
    const r = await runIdempotent(prisma, {
      ...base,
      key: 'key-aaaa-1111',
      work,
    });
    expect(r.id).toBe('p1');
    expect(events).toEqual(['tx-begin', 'lock', 'find', 'create', 'tx-commit']);
    const saved = store.get('u1|RENT_PAYMENT|key-aaaa-1111')!;
    expect(saved.response).toEqual({
      id: 'p1',
      amount: '100.5',
      at: '2026-10-09T00:00:00.000Z',
    });
    expect(saved.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + IDEMPOTENCY_TTL_MS - 5000,
    );
  });

  it('second call with the same key and body replays the stored response and does NOT run the work again', async () => {
    const { prisma } = fakePrisma();
    const work = jest.fn(async () => ({
      id: 'p1',
      amount: new Prisma.Decimal(100),
    }));
    const first = await runIdempotent(prisma, {
      ...base,
      key: 'key-aaaa-1111',
      work,
    });
    const second = await runIdempotent(prisma, {
      ...base,
      key: 'key-aaaa-1111',
      work,
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(second))).toEqual(
      JSON.parse(JSON.stringify(first)),
    );
  });

  it('the same key with a DIFFERENT body is rejected with 422 (never replays another request response)', async () => {
    const { prisma } = fakePrisma();
    const work = jest.fn(async () => ({ id: 'p1' }));
    await runIdempotent(prisma, { ...base, key: 'key-aaaa-1111', work });
    await expect(
      runIdempotent(prisma, {
        ...base,
        requestHash: 'h2-different',
        key: 'key-aaaa-1111',
        work,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('keys are scoped per user and per operation', async () => {
    const { prisma } = fakePrisma();
    const work = jest.fn(async () => ({ ok: true }));
    await runIdempotent(prisma, { ...base, key: 'key-aaaa-1111', work });
    await runIdempotent(prisma, {
      ...base,
      userId: 'u2',
      key: 'key-aaaa-1111',
      work,
    }); // other user: runs again
    await runIdempotent(prisma, {
      ...base,
      scope: 'ELECTRICITY_PAYMENT',
      key: 'key-aaaa-1111',
      work,
    }); // other scope: runs again
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('if the work fails, no key is stored, so a corrected retry with the SAME key is allowed', async () => {
    const { prisma, store } = fakePrisma();
    const failing = jest.fn(async () => {
      throw new BadRequestException('مبلغ از بدهی بیشتر است');
    });
    await expect(
      runIdempotent(prisma, { ...base, key: 'key-aaaa-1111', work: failing }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.size).toBe(0);

    const ok = jest.fn(async () => ({ id: 'p2' }));
    const r = await runIdempotent(prisma, {
      ...base,
      requestHash: 'h-corrected',
      key: 'key-aaaa-1111',
      work: ok,
    });
    expect(r).toEqual({ id: 'p2' });
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
