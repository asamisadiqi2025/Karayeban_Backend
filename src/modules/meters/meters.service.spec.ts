import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReplaceMeterDto } from './dto/replace-meter.dto';
import { MetersService } from './meters.service';

const D = (v: number | string) => new Prisma.Decimal(v);
const day = (offset: number) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

type MeterRow = {
  id: string;
  marketId: string;
  shopId: string | null;
  meterNumber: string | null;
  location: string | null;
  status: 'active' | 'inactive';
  serialNumber: string | null;
  lastReading: Prisma.Decimal | null;
  lastReadingDate: Date | null;
};
const baseMeter = (over: Partial<MeterRow> = {}): MeterRow => ({
  id: 'm1',
  marketId: 'mk1',
  shopId: 'shop1',
  meterNumber: '122',
  location: 'طبقه سوم',
  status: 'active',
  serialNumber: 'OLD-SN',
  lastReading: D(1180),
  lastReadingDate: new Date('2026-09-22T00:00:00Z'),
  ...over,
});

function setup(
  opts: {
    meter?: MeterRow | null;
    actor?: { role: string; marketId: string | null };
    updateManyCount?: number;
    createError?: Error;
    movedGroups?: number;
  } = {},
) {
  const meter = opts.meter === undefined ? baseMeter() : opts.meter;
  const audit = { record: jest.fn(async () => undefined) };
  const order: string[] = [];
  const calls: {
    updateMany?: any;
    create?: any;
    groups?: any;
    update?: any;
  } = {};
  const tx = {
    electricityMeter: {
      updateMany: jest.fn(async (args: unknown) => {
        order.push('deactivate-old');
        calls.updateMany = args;
        return { count: opts.updateManyCount ?? 1 };
      }),
      create: jest.fn(async (args: any) => {
        order.push('create-new');
        calls.create = args;
        if (opts.createError) throw opts.createError;
        return { id: 'm2', ...args.data, shop: { id: 'shop1' } };
      }),
      findUniqueOrThrow: jest.fn(async () => ({
        ...baseMeter(),
        status: 'inactive',
        shop: { id: 'shop1' },
      })),
      update: jest.fn(async (args: any) => {
        calls.update = args;
        return { ...(meter as MeterRow), ...args.data, shop: { id: 's1' } };
      }),
    },
    shopGroup: {
      updateMany: jest.fn(async (args: unknown) => {
        order.push('move-groups');
        calls.groups = args;
        return { count: opts.movedGroups ?? 0 };
      }),
    },
  };
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'u1',
        role: opts.actor?.role ?? 'ADMIN',
        marketId: opts.actor?.marketId ?? 'mk1',
      }),
    },
    electricityMeter: { findUnique: async () => meter },
    $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
  };
  const service = new MetersService(prisma as never, audit as never);
  return { service, audit, tx, calls, order };
}

const dto = (over: Partial<ReplaceMeterDto> = {}): ReplaceMeterDto =>
  ({
    newSerialNumber: 'NEW-SN',
    oldMeterFinalReading: 1180,
    reason: 'کنتور سوخته بود',
    ...over,
  }) as ReplaceMeterDto;
const U = { id: 'u1' };
const auditCalls = (audit: { record: jest.Mock }) =>
  audit.record.mock.calls as unknown as Record<string, any>[][];

describe('MetersService.replace (deactivate the broken meter + register a new one)', () => {
  it('deactivates the old meter, creates a NEW meter for the SAME shop, in this order, in one transaction', async () => {
    const { service, calls, order } = setup();
    const r = await service.replace(
      U,
      'm1',
      dto({ newMeterInitialReading: 10, replacedAt: day(-1) }),
    );

    expect(order).toEqual(['deactivate-old', 'create-new', 'move-groups']); // old first: it frees the shop for the new one
    expect(calls.updateMany.where).toMatchObject({
      id: 'm1',
      status: 'active',
      serialNumber: 'OLD-SN',
    });
    expect(String(calls.updateMany.where.lastReading)).toBe('1180'); // compare-and-swap on the current baseline
    expect(calls.updateMany.data).toEqual({ status: 'inactive' }); // nothing else of the old meter changes: its history stays

    expect(calls.create.data).toMatchObject({
      marketId: 'mk1',
      shopId: 'shop1',
      meterNumber: '122',
      serialNumber: 'NEW-SN',
      status: 'active',
      location: 'طبقه سوم',
    });
    expect(String(calls.create.data.lastReading)).toBe('10'); // the NEW meter starts from ITS OWN reading
    expect(r.meter.id).toBe('m2');
    expect(r.oldMeter.status).toBe('inactive');
    expect(r.replacement).toMatchObject({
      oldMeterId: 'm1',
      newMeterId: 'm2',
      oldSerialNumber: 'OLD-SN',
      newSerialNumber: 'NEW-SN',
      reason: 'کنتور سوخته بود',
    });
    expect(String(r.replacement.oldMeterFinalReading)).toBe('1180');
    expect(String(r.replacement.newMeterInitialReading)).toBe('10');
  });

  it('writes TWO immutable audit rows (old: UPDATE, new: CREATE), both with the reason, in the same transaction', async () => {
    const { service, audit } = setup();
    await service.replace(U, 'm1', dto(), { ip: '1.2.3.4', userAgent: 'jest' });
    const [oldRow, newRow] = auditCalls(audit).map((c) => c[0]);
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(oldRow).toMatchObject({
      action: 'UPDATE',
      entityType: 'ElectricityMeter',
      entityId: 'm1',
      reason: 'کنتور سوخته بود',
      userId: 'u1',
      ip: '1.2.3.4',
    });
    expect(oldRow.oldData.status).toBe('active');
    expect(oldRow.newData).toMatchObject({
      status: 'inactive',
      replacedByMeterId: 'm2',
    });
    expect(newRow).toMatchObject({
      action: 'CREATE',
      entityId: 'm2',
      reason: 'کنتور سوخته بود',
    });
    expect(newRow.newData).toMatchObject({
      serialNumber: 'NEW-SN',
      replacedMeterId: 'm1',
      shopId: 'shop1',
    });
    expect(oldRow.tx).toBeDefined();
    expect(newRow.tx).toBeDefined();
  });

  it('the new meter starts from 0 by default (a brand-new device)', async () => {
    const { service, calls } = setup();
    await service.replace(U, 'm1', dto());
    expect(String(calls.create.data.lastReading)).toBe('0');
    expect(calls.create.data.lastReadingDate).toBeInstanceOf(Date);
  });

  it('the old meter final reading is only a CHECK: it never becomes the new meter baseline', async () => {
    const { service, calls } = setup();
    await service.replace(
      U,
      'm1',
      dto({ oldMeterFinalReading: 1180, newMeterInitialReading: 7 }),
    );
    expect(String(calls.create.data.lastReading)).toBe('7');
  });

  it('moves the "primary meter" role of a shop group to the new meter', async () => {
    const { service, calls } = setup({ movedGroups: 1 });
    const r = await service.replace(U, 'm1', dto());
    expect(calls.groups).toEqual({
      where: { primaryMeterId: 'm1' },
      data: { primaryMeterId: 'm2' },
    });
    expect(r.replacement.shopGroupsMoved).toBe(1);
  });

  it('refuses when the old meter still has UNBILLED consumption (final reading > last billed reading), and says how to fix it', async () => {
    const { service, audit, order } = setup();
    const err = await service
      .replace(U, 'm1', dto({ oldMeterFinalReading: 1250 }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain('1180');
    expect(err.message).toContain('1250');
    expect(err.message).toContain('readingDate');
    expect(audit.record).not.toHaveBeenCalled();
    expect(order).toEqual([]); // nothing was touched
  });

  it('refuses a final reading lower than the last billed reading', async () => {
    const { service } = setup();
    await expect(
      service.replace(U, 'm1', dto({ oldMeterFinalReading: 1100 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a meter that never had a baseline can be replaced (nothing was billed, nothing to reconcile)', async () => {
    const { service } = setup({
      meter: baseMeter({ lastReading: null, lastReadingDate: null }),
    });
    await expect(
      service.replace(U, 'm1', dto({ oldMeterFinalReading: 40 })),
    ).resolves.toBeDefined();
  });

  it('only an ACTIVE meter can be replaced', async () => {
    const { service } = setup({ meter: baseMeter({ status: 'inactive' }) });
    await expect(service.replace(U, 'm1', dto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('the new serial must differ from the current one (case-insensitive) and cannot be blank', async () => {
    const { service } = setup();
    await expect(
      service.replace(U, 'm1', dto({ newSerialNumber: 'old-sn' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.replace(U, 'm1', dto({ newSerialNumber: '   ' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('the reason is mandatory (also trimmed: whitespace-only is not a reason)', async () => {
    const { service } = setup();
    await expect(
      service.replace(U, 'm1', dto({ reason: '   ' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a replacement date in the future, before the last reading, or invalid', async () => {
    const { service } = setup();
    await expect(
      service.replace(U, 'm1', dto({ replacedAt: day(3) })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.replace(U, 'm1', dto({ replacedAt: '2026-09-21' })),
    ).rejects.toBeInstanceOf(BadRequestException); // last reading was 2026-09-22
    await expect(
      service.replace(U, 'm1', dto({ replacedAt: 'garbage' as never })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows the replacement on the same day as the last reading', async () => {
    const { service } = setup();
    await expect(
      service.replace(U, 'm1', dto({ replacedAt: '2026-09-22' })),
    ).resolves.toBeDefined();
  });

  it('if the meter changed concurrently (a bill moved the reading) the new meter is NOT created and nothing is audited: 409', async () => {
    const { service, audit, order } = setup({ updateManyCount: 0 });
    await expect(service.replace(U, 'm1', dto())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(order).toEqual(['deactivate-old']);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('maps a duplicate serial number (unique violation) to a clear 409', async () => {
    const { service } = setup({
      createError: Object.assign(new Error('unique'), {
        code: 'P2002',
        meta: { target: ['serial_number'] },
      }),
    });
    const err = await service.replace(U, 'm1', dto()).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain('NEW-SN');
  });

  it('works for a meter that is not assigned to a shop (the new one is unassigned too)', async () => {
    const { service, calls } = setup({
      meter: baseMeter({ shopId: null, meterNumber: null }),
    });
    await service.replace(U, 'm1', dto());
    expect(calls.create.data.shopId).toBeNull();
  });

  it('404 for an unknown meter, 403 for a meter of another market (SUPER_ADMIN is allowed)', async () => {
    await expect(
      setup({ meter: null }).service.replace(U, 'x', dto()),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup({ actor: { role: 'ADMIN', marketId: 'OTHER' } }).service.replace(
        U,
        'm1',
        dto(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      setup({
        actor: { role: 'SUPER_ADMIN', marketId: null },
      }).service.replace(U, 'm1', dto()),
    ).resolves.toBeDefined();
  });
});

describe('MetersService.update: baseline changes are audited (behavior otherwise unchanged)', () => {
  it('audits a manual change of lastReading with the old and new value', async () => {
    const { service, audit } = setup();
    await service.update(U, 'm1', { lastReading: 0 } as never, {
      ip: '9.9.9.9',
      userAgent: 'ua',
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    const rec = auditCalls(audit)[0][0];
    expect(rec).toMatchObject({
      action: 'UPDATE',
      entityType: 'ElectricityMeter',
      entityId: 'm1',
      userId: 'u1',
      ip: '9.9.9.9',
    });
    expect(String(rec.oldData.lastReading)).toBe('1180');
    expect(rec.newData.lastReading).toBe(0);
    expect(Object.keys(rec.oldData)).toEqual(['lastReading']); // only what actually changed
  });

  it('audits a serial / status change too (this is also the manual way to retire a meter)', async () => {
    const { service, audit } = setup();
    await service.update(U, 'm1', {
      serialNumber: ' X-9 ',
      status: 'inactive',
    } as never);
    const rec = auditCalls(audit)[0][0];
    expect(Object.keys(rec.newData).sort()).toEqual(['serialNumber', 'status']);
    expect(rec.newData.serialNumber).toBe('X-9');
  });

  it('does NOT audit a change that does not affect billing (location only), and still performs it', async () => {
    const { service, audit, calls } = setup();
    await service.update(U, 'm1', { location: 'طبقهٔ دوم' } as never);
    expect(audit.record).not.toHaveBeenCalled();
    expect(calls.update.data).toEqual({ location: 'طبقهٔ دوم' });
  });

  it('re-activating an old meter while another active meter exists for the shop gives a clear 409 naming the shop', async () => {
    const dup = Object.assign(new Error('unique'), {
      code: 'P2002',
      meta: { target: ['shop_id'] },
    });
    const { service, tx } = setup({ meter: baseMeter({ status: 'inactive' }) });
    tx.electricityMeter.update.mockRejectedValueOnce(dup);
    const err = await service
      .update(U, 'm1', { status: 'active' } as never)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain('122'); // the shop number, not "undefined"
  });
});

describe('ReplaceMeterDto validation', () => {
  const errorsFor = async (o: Record<string, unknown>) =>
    (await validate(plainToInstance(ReplaceMeterDto, o))).map(
      (e) => e.property,
    );
  const valid = {
    newSerialNumber: 'SN-2',
    oldMeterFinalReading: 1180,
    reason: 'سوخته',
  };

  it('accepts a valid body', async () => {
    expect(await errorsFor(valid)).toEqual([]);
    expect(
      await errorsFor({
        ...valid,
        newMeterInitialReading: 0,
        replacedAt: '2026-10-01',
      }),
    ).toEqual([]);
    expect(await errorsFor({ ...valid, newMeterInitialReading: 10 })).toEqual(
      [],
    ); // a new meter may start at any reading
  });

  it('the reason is required: missing, empty and too short are all rejected', async () => {
    expect(
      await errorsFor({ newSerialNumber: 'SN-2', oldMeterFinalReading: 1 }),
    ).toContain('reason');
    expect(await errorsFor({ ...valid, reason: '' })).toContain('reason');
    expect(await errorsFor({ ...valid, reason: 'ab' })).toContain('reason');
  });

  it('rejects a missing serial, a missing/negative final reading and a bad date', async () => {
    expect(
      await errorsFor({ oldMeterFinalReading: 1, reason: 'سوخته' }),
    ).toContain('newSerialNumber');
    expect(
      await errorsFor({ ...valid, oldMeterFinalReading: undefined }),
    ).toContain('oldMeterFinalReading');
    expect(await errorsFor({ ...valid, oldMeterFinalReading: -1 })).toContain(
      'oldMeterFinalReading',
    );
    expect(await errorsFor({ ...valid, newMeterInitialReading: -5 })).toContain(
      'newMeterInitialReading',
    );
    expect(await errorsFor({ ...valid, replacedAt: 'yesterday' })).toContain(
      'replacedAt',
    );
  });
});
