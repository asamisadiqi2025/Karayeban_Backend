import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ElectricityService } from './electricity.service';

const AFN = { id: 'id-afn', code: 'AFN' };
const USD = { id: 'id-usd', code: 'USD' };
const EUR = { id: 'id-eur', code: 'EUR' }; // exists in catalog but NOT enabled for the market

// Only the prisma surface that resolveBillCurrencyId (and the resolver) uses.
function serviceWith(opts: {
  configured?: typeof AFN | null;
  enabled: (typeof AFN)[];
}) {
  const catalog = [AFN, USD, EUR];
  const prisma = {
    market: {
      findUnique: async () => ({
        electricityRateCurrency: opts.configured ?? null,
      }),
    },
    currency: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        catalog.find((c) => c.id === where.id) ?? null,
    },
    marketCurrency: {
      findUnique: async ({
        where,
      }: {
        where: { marketId_currencyId: { currencyId: string } };
      }) => {
        const c = opts.enabled.find(
          (e) => e.id === where.marketId_currencyId.currencyId,
        );
        return c ? { currency: c } : null;
      },
      findFirst: async ({
        where,
      }: {
        where: { currency: { code: string } };
      }) => {
        const c = opts.enabled.find((e) => e.code === where.currency.code);
        return c ? { currency: c } : null;
      },
    },
  };
  const service = new ElectricityService(prisma as never, {} as never);
  return (
    marketId: string,
    requested: string | undefined,
    isOpening: boolean,
  ) =>
    (
      service as unknown as {
        resolveBillCurrencyId: (
          m: string,
          r: string | undefined,
          o: boolean,
        ) => Promise<string>;
      }
    ).resolveBillCurrencyId(marketId, requested, isOpening);
}

describe('ElectricityService bill currency policy', () => {
  describe('live bills', () => {
    it('need no currencyId: the fixed market currency (AFN by default) is used', async () => {
      const resolve = serviceWith({ enabled: [AFN, USD] });
      await expect(resolve('m1', undefined, false)).resolves.toBe(AFN.id);
    });

    it('accept the same currencyId (older clients that still send it)', async () => {
      const resolve = serviceWith({ enabled: [AFN, USD] });
      await expect(resolve('m1', AFN.id, false)).resolves.toBe(AFN.id);
    });

    it('reject a different currency: no more AFN/USD mix-ups', async () => {
      const resolve = serviceWith({ enabled: [AFN, USD] });
      const err = await resolve('m1', USD.id, false).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('AFN');
    });

    it('follow the market setting when one exists', async () => {
      const resolve = serviceWith({ configured: USD, enabled: [AFN, USD] });
      await expect(resolve('m1', undefined, false)).resolves.toBe(USD.id);
      await expect(resolve('m1', AFN.id, false)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('opening (migrated) bills', () => {
    it('accept an explicit currency that is enabled, even if it is not the default', async () => {
      const resolve = serviceWith({ enabled: [AFN, USD] });
      await expect(resolve('m1', USD.id, true)).resolves.toBe(USD.id);
    });

    it('do not need the default currency to be enabled when an explicit one is given', async () => {
      const resolve = serviceWith({ enabled: [USD] }); // AFN not enabled
      await expect(resolve('m1', USD.id, true)).resolves.toBe(USD.id);
    });

    it('reject an unknown currency (404) and a currency not enabled for the market (400)', async () => {
      const resolve = serviceWith({ enabled: [AFN, USD] });
      await expect(resolve('m1', 'id-nope', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(resolve('m1', EUR.id, true)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('fall back to the fixed currency when none is given', async () => {
      const resolve = serviceWith({ enabled: [AFN, USD] });
      await expect(resolve('m1', undefined, true)).resolves.toBe(AFN.id);
    });
  });
});
