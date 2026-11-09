ALTER TABLE "appointments" ADD COLUMN "requestFingerprint" TEXT;
ALTER TABLE "invoices" ADD COLUMN "requestFingerprint" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN "requestFingerprint" TEXT;
