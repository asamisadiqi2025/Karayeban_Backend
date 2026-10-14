import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRentPaymentDto } from './dto/create-rent-payment.dto';
import { CreateRentPaymentsBulkDto } from './dto/create-rent-payments-bulk.dto';
import { RentService } from './rent.service';

const U = (n: number) =>
  `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const item = (over: Partial<CreateRentPaymentDto> = {}): CreateRentPaymentDto =>
  ({
    contractId: U(1),
    amount: 100,
    accountId: U(2),
    ...over,
  }) as CreateRentPaymentDto;

function makeService() {
  const service = new RentService({} as never, {} as never);
  const createPayment = jest.spyOn(service, 'createPayment');
  return { service, createPayment };
}
const bulk = (payments: CreateRentPaymentDto[]) =>
  ({ payments }) as CreateRentPaymentsBulkDto;
const user = { id: 'user-1' };

describe('RentService.createPaymentsBulk', () => {
  it('creates every valid item and reports nothing as failed', async () => {
    const { service, createPayment } = makeService();
    createPayment.mockImplementation(
      async (_u, dto) => ({ id: `p-${dto.amount}` }) as never,
    );
    const r = await service.createPaymentsBulk(
      user,
      bulk([item({ amount: 1 }), item({ amount: 2 })]),
    );
    expect(r.created).toHaveLength(2);
    expect(r.failed).toEqual([]);
  });

  it('runs items strictly one after another, in order (FIFO allocation must not interleave)', async () => {
    const { service, createPayment } = makeService();
    const log: string[] = [];
    createPayment.mockImplementation(async (_u, dto) => {
      log.push(`start-${dto.amount}`);
      await new Promise((r) => setTimeout(r, dto.amount === 1 ? 20 : 0));
      log.push(`end-${dto.amount}`);
      return { id: String(dto.amount) } as never;
    });
    await service.createPaymentsBulk(
      user,
      bulk([item({ amount: 1 }), item({ amount: 2 }), item({ amount: 3 })]),
    );
    expect(log).toEqual([
      'start-1',
      'end-1',
      'start-2',
      'end-2',
      'start-3',
      'end-3',
    ]);
  });

  it('one failing item does not stop the others; failures carry their input index', async () => {
    const { service, createPayment } = makeService();
    createPayment.mockImplementation(async (_u, dto) => {
      if (dto.amount === 2)
        throw new BadRequestException('مبلغ از بدهی بیشتر است');
      if (dto.amount === 4) throw new NotFoundException('قرارداد یافت نشد');
      return { id: String(dto.amount) } as never;
    });
    const r = await service.createPaymentsBulk(
      user,
      bulk([
        item({ amount: 1 }),
        item({ amount: 2 }),
        item({ amount: 3 }),
        item({ amount: 4 }),
      ]),
    );
    expect(r.created).toHaveLength(2);
    expect(r.failed).toEqual([
      { index: 1, error: 'مبلغ از بدهی بیشتر است' },
      { index: 3, error: 'قرارداد یافت نشد' },
    ]);
    expect(createPayment).toHaveBeenCalledTimes(4);
  });

  it('rejects a duplicate receipt number inside the same request, without calling createPayment for it', async () => {
    const { service, createPayment } = makeService();
    createPayment.mockImplementation(async () => ({ id: 'x' }) as never);
    const r = await service.createPaymentsBulk(
      user,
      bulk([
        item({ receiptNumber: 'R-1' }),
        item({ receiptNumber: ' R-1 ' }),
        item({ receiptNumber: 'R-2' }),
        item(),
      ]),
    );
    expect(r.created).toHaveLength(3);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].index).toBe(1);
    expect(r.failed[0].error).toContain('R-1');
    expect(createPayment).toHaveBeenCalledTimes(3);
  });

  it('allows retrying a receipt number inside the request if its first use failed', async () => {
    const { service, createPayment } = makeService();
    createPayment
      .mockRejectedValueOnce(new ConflictException('خطا'))
      .mockResolvedValueOnce({ id: 'ok' } as never);
    const r = await service.createPaymentsBulk(
      user,
      bulk([item({ receiptNumber: 'R-9' }), item({ receiptNumber: 'R-9' })]),
    );
    expect(r.created).toHaveLength(1);
    expect(r.failed).toEqual([{ index: 0, error: 'خطا' }]);
  });

  it('does not leak the text of an unexpected (non-HTTP) error to the client', async () => {
    const { service, createPayment } = makeService();
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    createPayment.mockRejectedValueOnce(
      new Error(
        'connection to server at "10.0.0.5" failed: password authentication failed',
      ),
    );
    const r = await service.createPaymentsBulk(user, bulk([item()]));
    expect(r.failed).toEqual([{ index: 0, error: 'خطای ناشناخته' }]);
    expect(JSON.stringify(r)).not.toContain('10.0.0.5');
    expect(logged).toHaveBeenCalledTimes(1); // but it IS logged server-side for the developers
    logged.mockRestore();
  });

  it('passes the request meta (ip / user agent for the audit log) to every item', async () => {
    const { service, createPayment } = makeService();
    createPayment.mockImplementation(async () => ({ id: 'x' }) as never);
    const meta = { ip: '1.2.3.4', userAgent: 'jest' };
    await service.createPaymentsBulk(user, bulk([item(), item()]), meta);
    expect(createPayment.mock.calls.map((c) => c[2])).toEqual([meta, meta]);
  });
});

describe('RentService.createPaymentsBulk idempotency keys', () => {
  it('forwards a per-item key derived from the request key (retrying a whole request only redoes the missing items)', async () => {
    const { service, createPayment } = makeService();
    createPayment.mockImplementation(async () => ({ id: 'x' }) as never);
    await service.createPaymentsBulk(
      user,
      bulk([item(), item(), item()]),
      { ip: null, userAgent: null },
      'request-key-1234',
    );
    expect(createPayment.mock.calls.map((c) => c[3])).toEqual([
      'request-key-1234#0',
      'request-key-1234#1',
      'request-key-1234#2',
    ]);
  });

  it('forwards no key at all when the request has none (old behavior)', async () => {
    const { service, createPayment } = makeService();
    createPayment.mockImplementation(async () => ({ id: 'x' }) as never);
    await service.createPaymentsBulk(user, bulk([item(), item()]));
    expect(createPayment.mock.calls.map((c) => c[3])).toEqual([
      undefined,
      undefined,
    ]);
  });
});

describe('CreateRentPaymentsBulkDto validation', () => {
  const errorsFor = async (payload: unknown) =>
    validate(plainToInstance(CreateRentPaymentsBulkDto, payload));

  it('accepts 1..10 valid payments', async () => {
    expect(
      await errorsFor({
        payments: [{ contractId: U(1), amount: 5, accountId: U(2) }],
      }),
    ).toEqual([]);
    expect(
      await errorsFor({
        payments: Array.from({ length: 10 }, () => ({
          contractId: U(1),
          amount: 5,
          accountId: U(2),
        })),
      }),
    ).toEqual([]);
  });

  it('rejects an empty list and more than 10 items', async () => {
    expect((await errorsFor({ payments: [] })).length).toBeGreaterThan(0);
    expect(
      (
        await errorsFor({
          payments: Array.from({ length: 11 }, () => ({
            contractId: U(1),
            amount: 5,
            accountId: U(2),
          })),
        })
      ).length,
    ).toBeGreaterThan(0);
  });

  it('validates every nested item with the same rules as the single endpoint', async () => {
    const bad = await errorsFor({
      payments: [{ contractId: 'nope', amount: -5 }],
    });
    expect(bad.length).toBeGreaterThan(0);
    const nested = JSON.stringify(bad);
    expect(nested).toContain('contractId');
    expect(nested).toContain('amount');
  });

  it('requires accountId for BANK payments but not for SECURITY_DEPOSIT (same as the single endpoint)', async () => {
    expect(
      (await errorsFor({ payments: [{ contractId: U(1), amount: 5 }] })).length,
    ).toBeGreaterThan(0);
    expect(
      await errorsFor({
        payments: [{ contractId: U(1), amount: 5, source: 'SECURITY_DEPOSIT' }],
      }),
    ).toEqual([]);
  });
});
