import { Prisma } from '@prisma/client';
import { buildBillSnapshot } from './electricity-bill-snapshot';

const D = (v: number | string) => new Prisma.Decimal(v);

const live = {
  isOpeningEntry: false,
  totalAmountProvided: false,
  marketRate: D(18),
  previousReading: D(1000),
  currentReading: D(1250),
  readingsProvidedExplicitly: false,
};

describe('buildBillSnapshot', () => {
  describe('live bill, amount calculated by the system', () => {
    it('stores the market rate and the consumption, and is not manual', () => {
      const s = buildBillSnapshot(live);
      expect(s.ratePerUnit?.toString()).toBe('18');
      expect(s.consumedUnits?.toString()).toBe('250');
      expect(s.isManualAmount).toBe(false);
    });

    it('keeps total = consumedUnits x ratePerUnit consistent', () => {
      const s = buildBillSnapshot(live);
      expect(s.consumedUnits!.mul(s.ratePerUnit!).toString()).toBe('4500');
    });

    it('works with decimal readings and rates', () => {
      const s = buildBillSnapshot({
        ...live,
        marketRate: D('18.5'),
        previousReading: D('100.25'),
        currentReading: D('130.75'),
      });
      expect(s.consumedUnits?.toString()).toBe('30.5');
      expect(s.ratePerUnit?.toString()).toBe('18.5');
    });

    it('treats a first reading (previous = 0 after the service default) as full consumption', () => {
      const s = buildBillSnapshot({
        ...live,
        previousReading: D(0),
        currentReading: D(80),
      });
      // 0 is a real previous reading (the service defaults a missing one to 0), not "unknown"
      expect(s.consumedUnits?.toString()).toBe('80');
    });

    it('allows zero consumption', () => {
      const s = buildBillSnapshot({
        ...live,
        previousReading: D(500),
        currentReading: D(500),
      });
      expect(s.consumedUnits?.toString()).toBe('0');
    });
  });

  describe('live bill, amount typed manually (special discount / agreement)', () => {
    it('still keeps the market rate and units for reference, but flags the amount as manual', () => {
      const s = buildBillSnapshot({ ...live, totalAmountProvided: true });
      expect(s.isManualAmount).toBe(true);
      expect(s.ratePerUnit?.toString()).toBe('18');
      expect(s.consumedUnits?.toString()).toBe('250');
    });

    it('leaves consumption unknown (null) when the previous reading is unknown', () => {
      const s = buildBillSnapshot({
        ...live,
        totalAmountProvided: true,
        previousReading: null,
      });
      expect(s.consumedUnits).toBeNull();
      expect(s.isManualAmount).toBe(true);
    });

    it('leaves consumption null (never negative) when the meter was replaced / went backwards', () => {
      const s = buildBillSnapshot({
        ...live,
        totalAmountProvided: true,
        previousReading: D(9000),
        currentReading: D(12),
      });
      expect(s.consumedUnits).toBeNull();
    });
  });

  describe('opening (migrated paper-ledger) bill', () => {
    const opening = {
      ...live,
      isOpeningEntry: true,
      totalAmountProvided: true,
      marketRate: null,
    };

    it('is always manual and never invents a rate', () => {
      const s = buildBillSnapshot({ ...opening, marketRate: D(18) });
      expect(s.isManualAmount).toBe(true);
      expect(s.ratePerUnit).toBeNull();
    });

    it('does NOT derive consumption from a previous reading that came from the meter, not the client', () => {
      // previousReading here = the meter's CURRENT lastReading, wrong for a historical period
      const s = buildBillSnapshot({
        ...opening,
        readingsProvidedExplicitly: false,
      });
      expect(s.consumedUnits).toBeNull();
    });

    it('derives consumption only when the client sent both readings explicitly', () => {
      const s = buildBillSnapshot({
        ...opening,
        previousReading: D(300),
        currentReading: D(340),
        readingsProvidedExplicitly: true,
      });
      expect(s.consumedUnits?.toString()).toBe('40');
      expect(s.ratePerUnit).toBeNull();
    });

    it('has no consumption when there are no readings at all', () => {
      const s = buildBillSnapshot({
        ...opening,
        previousReading: null,
        currentReading: null,
      });
      expect(s.consumedUnits).toBeNull();
    });
  });
});
