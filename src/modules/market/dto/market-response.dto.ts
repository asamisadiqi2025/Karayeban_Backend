export class MarketResponseDto {
  id: string;
  name: string;
  nameEn?: string;
  address: string;
  phone?: string;
  logo?: string;
  baseCurrency?: string;
  exchangeRate?: number;
  hasWater?: boolean;
  isSetupComplete?: boolean;
}
