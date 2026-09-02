-- CreateTable
CREATE TABLE "market_currencies" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "currency_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_currencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_currencies_market_id_idx" ON "market_currencies"("market_id");

-- CreateIndex
CREATE UNIQUE INDEX "market_currencies_market_id_currency_id_key" ON "market_currencies"("market_id", "currency_id");

-- AddForeignKey
ALTER TABLE "market_currencies" ADD CONSTRAINT "market_currencies_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_currencies" ADD CONSTRAINT "market_currencies_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
