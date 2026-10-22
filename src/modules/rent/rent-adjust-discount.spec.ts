import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, RentChargeStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdjustContractRentDto } from '../contracts/dto/adjust-contract-rent.dto';
import { DiscountDebtDto } from '../contracts/dto/discount-debt.dto';
import { RentService } from './rent.service';

const D = (n: number | string) => new Prisma.Decimal(n);
const user = { id: 'u1' };

type ChargeRow = ReturnType<typeof charge>;
function charge(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    days: 30,
    dailyRate: D('166.6667'),
    grossAmount: D(5000),
    discountAmount: D(0),
    netAmount: D(5000),
    paidAmount: D(0),
    remainingAmount: D(5000),
    status: RentChargeStatus.PENDING,
    notes: null as string | null,
    periodStart: new Date('2026-01-01T00:00:00Z'),
    periodEnd: new Date('2026-01-31T00:00:00Z'),
    ...over,
  };
}

function setup(opts: {
  contract?: Record<string, unknown> | null;
  charges?: ChargeRow[];
}) {
  const contract =
    opts.contract === null
      ? null
      : {
          id: 'k1',
          marketId: 'm1',
          tenantId: 't1',
          status: 'active',
          rent: D(5000),
          ...opts.contract,
        };
  const charges = opts.charges ?? [];
  const tx = {
    rentCharges: {
      findMany: jest.fn().mockResolvedValue(charges),
      update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
  };
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'u1', role: 'ADMIN', marketId: 'm1' }),
    },
    contract: { findUnique: jest.fn().mockResolvedValue(contract) },
    rentCharges: { findMany: jest.fn().mockResolvedValue(charges) },
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const auditLog = { record: jest.fn() };
  const service = new RentService(prisma as never, auditLog as never);
  const recompute = jest
    .spyOn(service, 'recomputeRentDebt')
    .mockResolvedValue(undefined as never);
  return { service, prisma, tx, auditLog, recompute };
}

const adjust = (over: Record<string, unknown> = {}) => ({
  newRent: 4000,
  effectiveFrom: '2026-01-01',
  reason: 'کسادی بازار',
  ...over,
});

describe('RentService.adjustFutureRent', () => {
  it('lowers a full month from 5000 to 4000 (discount 1000), leaves Contract.rent alone', async () => {
    const { service, tx, recompute } = setup({ charges: [charge()] });
    const r = await service.adjustFutureRent(user, 'k1', adjust());
    expect(r).toHaveLength(1);
    const data = tx.rentCharges.update.mock.calls[0][0].data;
    expect(data.netAmount.toString()).toBe('4000');
    expect(data.discountAmount.toString()).toBe('1000');
    expect(data.remainingAmount.toString()).toBe('4000');
    expect(data.status).toBe(RentChargeStatus.PENDING);
    expect(data.notes).toContain('5000 → 4000');
    expect(recompute).toHaveBeenCalledWith(tx, 't1');
  });

  it('applies the new rate only inside [effectiveFrom, effectiveTo) when effectiveTo is given', async () => {
    const { service, prisma } = setup({ charges: [charge()] });
    await service.adjustFutureRent(
      user,
      'k1',
      adjust({ effectiveFrom: '2026-01-01', effectiveTo: '2026-04-01' }),
    );
    const where = prisma.rentCharges.findMany.mock.calls[0][0].where;
    expect(where.periodStart.gte).toEqual(new Date('2026-01-01'));
    expect(where.periodStart.lt).toEqual(new Date('2026-04-01'));
  });

  it('without effectiveTo it still runs to the end of the contract (old behaviour)', async () => {
    const { service, prisma } = setup({ charges: [charge()] });
    await service.adjustFutureRent(user, 'k1', adjust());
    const where = prisma.rentCharges.findMany.mock.calls[0][0].where;
    expect(where.periodStart).toEqual({ gte: new Date('2026-01-01') });
  });

  it('still only touches PENDING/OVERDUE invoices (PARTIAL/PAID stay as they were)', async () => {
    const { service, prisma } = setup({ charges: [charge()] });
    await service.adjustFutureRent(user, 'k1', adjust());
    const where = prisma.rentCharges.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({
      in: [RentChargeStatus.PENDING, RentChargeStatus.OVERDUE],
    });
  });

  it('rejects a rent higher than the signed Contract.rent and writes nothing', async () => {
    const { service, tx, prisma } = setup({ charges: [charge()] });
    await expect(
      service.adjustFutureRent(user, 'k1', adjust({ newRent: 6000 })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.adjustFutureRent(user, 'k1', adjust({ newRent: 6000 })),
    ).rejects.toThrow(/نمی‌تواند از کرایهٔ قرارداد/);
    expect(prisma.rentCharges.findMany).not.toHaveBeenCalled();
    expect(tx.rentCharges.update).not.toHaveBeenCalled();
  });

  it('allows newRent == Contract.rent: puts the month back to normal (discount 0)', async () => {
    // ماهی که قبلاً با adjust-rent به ۴۰۰۰ رسیده بود (gross 5000، discount 1000).
    const reduced = charge({
      netAmount: D(4000),
      discountAmount: D(1000),
      remainingAmount: D(4000),
    });
    const { service, tx } = setup({ charges: [reduced] });
    await service.adjustFutureRent(user, 'k1', adjust({ newRent: 5000 }));
    const data = tx.rentCharges.update.mock.calls[0][0].data;
    expect(data.netAmount.toString()).toBe('5000');
    expect(data.discountAmount.toString()).toBe('0');
    expect(data.remainingAmount.toString()).toBe('5000');
  });

  it('can re-adjust an already adjusted month to a different lower rate (always computed from gross)', async () => {
    const reduced = charge({
      netAmount: D(4000),
      discountAmount: D(1000),
      remainingAmount: D(4000),
    });
    const { service, tx } = setup({ charges: [reduced] });
    await service.adjustFutureRent(user, 'k1', adjust({ newRent: 4500 }));
    const data = tx.rentCharges.update.mock.calls[0][0].data;
    expect(data.netAmount.toString()).toBe('4500');
    expect(data.discountAmount.toString()).toBe('500');
  });

  it('scales a short last period by its days instead of charging a whole month', async () => {
    // قرارداد با ماهِ آخرِ ۱۵ روزه از ۳۱: مبلغ اصلی 2419.3548 = 5000 × 15 / 31.
    const short = charge({
      days: 15,
      grossAmount: D('2419.3548'),
      netAmount: D('2419.3548'),
      remainingAmount: D('2419.3548'),
    });
    const { service, tx } = setup({ charges: [short] });
    await service.adjustFutureRent(user, 'k1', adjust());
    const data = tx.rentCharges.update.mock.calls[0][0].data;
    expect(data.netAmount.toFixed(4)).toBe('1935.4838'); // 80% — نه 4000
    expect(data.discountAmount.toFixed(4)).toBe('483.8710');
    expect(data.dailyRate.mul(15).toFixed(4)).toBe('1935.4838');
  });

  it('rejects effectiveTo that is not after effectiveFrom', async () => {
    const { service } = setup({ charges: [charge()] });
    await expect(
      service.adjustFutureRent(
        user,
        'k1',
        adjust({ effectiveFrom: '2026-04-01', effectiveTo: '2026-04-01' }),
      ),
    ).rejects.toThrow(/effectiveTo/);
    await expect(
      service.adjustFutureRent(
        user,
        'k1',
        adjust({ effectiveFrom: '2026-04-01', effectiveTo: '2026-02-01' }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it.each(['', '   ', undefined])('requires a reason (got %p)', async (reason) => {
    const { service, tx } = setup({ charges: [charge()] });
    await expect(
      service.adjustFutureRent(user, 'k1', adjust({ reason })),
    ).rejects.toThrow(/reason/);
    expect(tx.rentCharges.update).not.toHaveBeenCalled();
  });

  it('refuses a contract that is not active (unchanged rule)', async () => {
    const { service } = setup({
      contract: { status: 'early_terminated' },
      charges: [charge()],
    });
    await expect(
      service.adjustFutureRent(user, 'k1', adjust()),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses a contract without a recorded rent (no cap to compare with)', async () => {
    const { service } = setup({ contract: { rent: null }, charges: [charge()] });
    await expect(
      service.adjustFutureRent(user, 'k1', adjust()),
    ).rejects.toThrow(/کرایهٔ این قرارداد ثبت نشده/);
  });

  it('errors with a range-specific message when no unpaid invoice falls in the range', async () => {
    const { service, tx } = setup({ charges: [] });
    await expect(
      service.adjustFutureRent(
        user,
        'k1',
        adjust({ effectiveTo: '2026-04-01' }),
      ),
    ).rejects.toThrow(/در این بازه/);
    expect(tx.rentCharges.update).not.toHaveBeenCalled();
  });

  it('records the range and the reason in the note and the audit log', async () => {
    const { service, tx, auditLog } = setup({ charges: [charge()] });
    await service.adjustFutureRent(
      user,
      'k1',
      adjust({ effectiveFrom: '2026-01-01', effectiveTo: '2026-04-01' }),
    );
    const note = tx.rentCharges.update.mock.calls[0][0].data.notes as string;
    expect(note).toContain('از 2026-01-01 تا 2026-04-01');
    expect(note).toContain('کسادی بازار');
    const audit = auditLog.record.mock.calls[0][0];
    expect(audit.oldData.effectiveTo).toBe('2026-04-01');
    expect(audit.newData.reason).toBe('کسادی بازار');
  });
});

describe('RentService.discountDebt', () => {
  const discount = (over: Record<string, unknown> = {}) => ({
    amount: 3000,
    reason: 'تصمیم رئیس بازار',
    ...over,
  });

  it('14,000 owed, 3,000 forgiven: invoice becomes gross 14000 / discount 3000 / net 11000 / remaining 11000', async () => {
    const owed = charge({
      grossAmount: D(14000),
      netAmount: D(14000),
      remainingAmount: D(14000),
    });
    const { service, tx, recompute } = setup({ charges: [owed] });
    const r = await service.discountDebt(user, 'k1', discount());
    const data = tx.rentCharges.update.mock.calls[0][0].data;
    expect(data.discountAmount.toString()).toBe('3000');
    expect(data.netAmount.toString()).toBe('11000');
    expect(data.remainingAmount.toString()).toBe('11000');
    expect(data.status).toBe(RentChargeStatus.PENDING);
    expect(r.totalDiscounted).toBe('3000');
    expect(recompute).toHaveBeenCalledWith(tx, 't1');
  });

  it('moves no money: it only touches rent invoices (no payments/ledger/accounts calls)', async () => {
    const { service, tx } = setup({ charges: [charge()] });
    await service.discountDebt(user, 'k1', discount());
    expect(Object.keys(tx)).toEqual(['rentCharges']);
  });

  it('spreads the forgiveness FIFO over the oldest invoices and can fully close one', async () => {
    const a = charge({
      id: 'a',
      periodStart: new Date('2026-01-01T00:00:00Z'),
      remainingAmount: D(2000),
      netAmount: D(2000),
      grossAmount: D(2000),
    });
    const b = charge({
      id: 'b',
      periodStart: new Date('2026-02-01T00:00:00Z'),
      remainingAmount: D(5000),
    });
    const { service, tx } = setup({ charges: [a, b] });
    await service.discountDebt(user, 'k1', discount({ amount: 3000 }));
    const [first, second] = tx.rentCharges.update.mock.calls.map((c) => c[0]);
    expect(first.where.id).toBe('a');
    expect(first.data.remainingAmount.toString()).toBe('0');
    expect(first.data.status).toBe(RentChargeStatus.PAID);
    expect(second.where.id).toBe('b');
    expect(second.data.remainingAmount.toString()).toBe('4000');
    expect(second.data.discountAmount.toString()).toBe('1000');
  });

  it('keeps a partly paid invoice PARTIAL when forgiveness does not close it', async () => {
    const partial = charge({
      status: RentChargeStatus.PARTIAL,
      paidAmount: D(1000),
      remainingAmount: D(4000),
    });
    const { service, tx } = setup({ charges: [partial] });
    await service.discountDebt(user, 'k1', discount({ amount: 1000 }));
    const data = tx.rentCharges.update.mock.calls[0][0].data;
    expect(data.status).toBe(RentChargeStatus.PARTIAL);
    expect(data.remainingAmount.toString()).toBe('3000');
    expect(data.netAmount.toString()).toBe('4000');
  });

  it('only forgives DUE debt: the query excludes invoices whose period has not started', async () => {
    const { service, tx } = setup({ charges: [charge()] });
    const before = Date.now();
    await service.discountDebt(user, 'k1', discount());
    const where = tx.rentCharges.findMany.mock.calls[0][0].where;
    expect(where.periodStart.lte).toBeInstanceOf(Date);
    expect(where.periodStart.lte.getTime()).toBeGreaterThanOrEqual(before);
    expect(where.status).toEqual({ in: expect.arrayContaining(['PENDING', 'PARTIAL', 'OVERDUE']) });
  });

  it('rejects an amount larger than the due debt, with a message that says "due"', async () => {
    const { service, tx } = setup({ charges: [charge({ remainingAmount: D(1000) })] });
    await expect(
      service.discountDebt(user, 'k1', discount({ amount: 3000 })),
    ).rejects.toThrow(/سررسیدشده/);
    expect(tx.rentCharges.update).not.toHaveBeenCalled();
  });

  it.each(['', '  ', undefined])('requires a reason (got %p)', async (reason) => {
    const { service, tx, prisma } = setup({ charges: [charge()] });
    await expect(
      service.discountDebt(user, 'k1', discount({ reason })),
    ).rejects.toThrow(/reason/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.rentCharges.update).not.toHaveBeenCalled();
  });

  it('writes the reason into the invoice note and the audit log', async () => {
    const { service, tx, auditLog } = setup({ charges: [charge()] });
    await service.discountDebt(user, 'k1', discount());
    expect(tx.rentCharges.update.mock.calls[0][0].data.notes).toContain(
      'تصمیم رئیس بازار',
    );
    expect(auditLog.record.mock.calls[0][0].newData.reason).toBe(
      'تصمیم رئیس بازار',
    );
  });
});

describe('DTO validation', () => {
  const errorsOf = async (cls: new () => object, plain: object) =>
    (await validate(plainToInstance(cls, plain))).map((e) => e.property);

  it('adjust-rent: reason is mandatory, effectiveTo is optional and must be a date', async () => {
    const ok = { newRent: 4000, effectiveFrom: '2026-01-01', reason: 'x' };
    expect(await errorsOf(AdjustContractRentDto, ok)).toEqual([]);
    expect(
      await errorsOf(AdjustContractRentDto, {
        ...ok,
        effectiveTo: '2026-04-01',
      }),
    ).toEqual([]);
    expect(
      await errorsOf(AdjustContractRentDto, { ...ok, reason: undefined }),
    ).toContain('reason');
    expect(
      await errorsOf(AdjustContractRentDto, { ...ok, reason: '' }),
    ).toContain('reason');
    expect(
      await errorsOf(AdjustContractRentDto, { ...ok, effectiveTo: 'soon' }),
    ).toContain('effectiveTo');
  });

  it('discount-debt: reason is mandatory, amount must be positive', async () => {
    const ok = { amount: 3000, reason: 'x' };
    expect(await errorsOf(DiscountDebtDto, ok)).toEqual([]);
    expect(
      await errorsOf(DiscountDebtDto, { amount: 3000 }),
    ).toContain('reason');
    expect(
      await errorsOf(DiscountDebtDto, { ...ok, amount: 0 }),
    ).toContain('amount');
  });
});
