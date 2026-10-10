import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  DEFAULT_ELECTRICITY_CURRENCY_CODE,
  resolveElectricityCurrency,
} from './resolve-electricity-currency';

const AFN = { id: 'id-afn', code: 'AFN' };
const USD = { id: 'id-usd', code: 'USD' };

// Fake PrismaService with only what the resolver touches.
// `configured` = Market.electricityRateCurrency, `enabled` = currencies linked to the market.
function fakePrisma(opts: {
  configured?: { id: string; code: string } | null;
  enabled: { id: string; code: string }[];
}) {
  const calls: string[] = [];
  const prisma = {
    market: {
      findUnique: async () => {
        calls.push('market.findUnique');
        return { electricityRateCurrency: opts.configured ?? null };
      },
    },
    marketCurrency: {
      findUnique: async ({
        where,
      }: {
        where: { marketId_currencyId: { currencyId: string } };
      }) => {
        calls.push('marketCurrency.findUnique');
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
        calls.push('marketCurrency.findFirst');
        const c = opts.enabled.find((e) => e.code === where.currency.code);
        return c ? { currency: c } : null;
      },
    },
  };
  return { prisma: prisma as unknown as PrismaService, calls };
}

describe('resolveElectricityCurrency', () => {
  it('defaults to AFN when the market has no electricity currency configured', async () => {
    const { prisma } = fakePrisma({ enabled: [AFN, USD] });
    await expect(resolveElectricityCurrency(prisma, 'm1')).resolves.toEqual({
      ...AFN,
      source: 'DEFAULT',
    });
    expect(DEFAULT_ELECTRICITY_CURRENCY_CODE).toBe('AFN');
  });

  it('uses the market-configured currency when present', async () => {
    const { prisma } = fakePrisma({ configured: USD, enabled: [AFN, USD] });
    await expect(resolveElectricityCurrency(prisma, 'm1')).resolves.toEqual({
      ...USD,
      source: 'MARKET_SETTING',
    });
  });

  it('does a fixed small number of queries (2) in both modes', async () => {
    const a = fakePrisma({ enabled: [AFN] });
    await resolveElectricityCurrency(a.prisma, 'm1');
    expect(a.calls).toEqual(['market.findUnique', 'marketCurrency.findFirst']);

    const b = fakePrisma({ configured: USD, enabled: [USD] });
    await resolveElectricityCurrency(b.prisma, 'm1');
    expect(b.calls).toEqual(['market.findUnique', 'marketCurrency.findUnique']);
  });

  it('fails clearly when AFN is not enabled for the market', async () => {
    const { prisma } = fakePrisma({ enabled: [USD] });
    const err = await resolveElectricityCurrency(prisma, 'm1').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('AFN');
  });

  it('fails clearly when the configured currency is not enabled for the market', async () => {
    const { prisma } = fakePrisma({ configured: USD, enabled: [AFN] });
    const err = await resolveElectricityCurrency(prisma, 'm1').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('USD');
  });

  it('does not silently fall back to AFN when a configured currency is broken', async () => {
    // Configured USD is not enabled, AFN is: must NOT quietly bill in AFN.
    const { prisma } = fakePrisma({ configured: USD, enabled: [AFN] });
    await expect(
      resolveElectricityCurrency(prisma, 'm1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
