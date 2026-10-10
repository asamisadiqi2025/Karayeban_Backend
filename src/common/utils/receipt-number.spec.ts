import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assertReceiptNumberFree,
  normalizeReceiptNumber,
} from './receipt-number';

describe('normalizeReceiptNumber', () => {
  it('trims, and treats blank/undefined/null as "no receipt"', () => {
    expect(normalizeReceiptNumber('  R-1  ')).toBe('R-1');
    expect(normalizeReceiptNumber('R-1')).toBe('R-1');
    expect(normalizeReceiptNumber('   ')).toBeNull();
    expect(normalizeReceiptNumber('')).toBeNull();
    expect(normalizeReceiptNumber(undefined)).toBeNull();
    expect(normalizeReceiptNumber(null)).toBeNull();
  });
});

function fakeTx(existing: { rent?: boolean; electricity?: boolean }) {
  const calls: string[] = [];
  const lockKeys: unknown[] = [];
  const tx = {
    $executeRaw: async (
      _strings: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      calls.push('lock');
      lockKeys.push(values[0]);
      return 1;
    },
    rentPayment: {
      findFirst: async (args: unknown) => {
        calls.push('rent.findFirst');
        lastWhere.push(args);
        return existing.rent ? { id: 'x' } : null;
      },
    },
    electricityPayment: {
      findFirst: async (args: unknown) => {
        calls.push('electricity.findFirst');
        lastWhere.push(args);
        return existing.electricity ? { id: 'y' } : null;
      },
    },
  };
  const lastWhere: unknown[] = [];
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    calls,
    lockKeys,
    lastWhere,
  };
}

describe('assertReceiptNumberFree', () => {
  it('takes the advisory lock BEFORE checking, so concurrent identical receipts are serialized', async () => {
    const { tx, calls } = fakeTx({});
    await assertReceiptNumberFree(tx, {
      kind: 'rent',
      marketId: 'm1',
      receiptNumber: 'R-1',
    });
    expect(calls).toEqual(['lock', 'rent.findFirst']);
  });

  it('passes when the receipt is unused', async () => {
    const { tx } = fakeTx({});
    await expect(
      assertReceiptNumberFree(tx, {
        kind: 'rent',
        marketId: 'm1',
        receiptNumber: 'R-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects a used receipt with 409 and a message naming the receipt and the kind', async () => {
    const { tx } = fakeTx({ rent: true });
    const err = await assertReceiptNumberFree(tx, {
      kind: 'rent',
      marketId: 'm1',
      receiptNumber: 'R-1',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain('R-1');
    expect(err.message).toContain('کرایه');
  });

  it('checks the right table per kind (a combined rent+electricity receipt must stay possible)', async () => {
    const rentUsed = fakeTx({ rent: true });
    await expect(
      assertReceiptNumberFree(rentUsed.tx, {
        kind: 'electricity',
        marketId: 'm1',
        receiptNumber: 'R-1',
      }),
    ).resolves.toBeUndefined();
    expect(rentUsed.calls).toEqual(['lock', 'electricity.findFirst']);

    const elecUsed = fakeTx({ electricity: true });
    const err = await assertReceiptNumberFree(elecUsed.tx, {
      kind: 'electricity',
      marketId: 'm1',
      receiptNumber: 'R-1',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain('برق');
  });

  it('matches case-insensitively and always within the same market', async () => {
    const { tx, lastWhere } = fakeTx({});
    await assertReceiptNumberFree(tx, {
      kind: 'rent',
      marketId: 'm-42',
      receiptNumber: 'AbC-9',
    });
    expect(lastWhere[0]).toEqual({
      where: {
        marketId: 'm-42',
        receiptNumber: { equals: 'AbC-9', mode: 'insensitive' },
      },
      select: { id: true },
    });
  });

  it('uses a lock key that is per (kind, market, lower-cased receipt)', async () => {
    const a = fakeTx({});
    await assertReceiptNumberFree(a.tx, {
      kind: 'rent',
      marketId: 'm1',
      receiptNumber: 'R-1',
    });
    const b = fakeTx({});
    await assertReceiptNumberFree(b.tx, {
      kind: 'rent',
      marketId: 'm1',
      receiptNumber: 'r-1',
    });
    const c = fakeTx({});
    await assertReceiptNumberFree(c.tx, {
      kind: 'electricity',
      marketId: 'm1',
      receiptNumber: 'R-1',
    });
    const d = fakeTx({});
    await assertReceiptNumberFree(d.tx, {
      kind: 'rent',
      marketId: 'm2',
      receiptNumber: 'R-1',
    });
    expect(a.lockKeys[0]).toBe(b.lockKeys[0]); // R-1 and r-1 serialize against each other
    expect(a.lockKeys[0]).not.toBe(c.lockKeys[0]); // rent and electricity do not block each other
    expect(a.lockKeys[0]).not.toBe(d.lockKeys[0]); // other markets do not block each other
  });
});
