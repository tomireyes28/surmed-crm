-- Fase 2 (T07, T08, T09, T10): Integridad de negocio, precisión monetaria Decimal(12,2),
-- restricciones CHECK en PostgreSQL, claves de idempotencia e índices compuestos.

-- 1. Conversión de Float (DOUBLE PRECISION) a DECIMAL(12, 2)
ALTER TABLE "products"
  ALTER COLUMN "price" TYPE DECIMAL(12, 2)
  USING ROUND(CAST("price" AS NUMERIC), 2);

ALTER TABLE "invoices"
  ALTER COLUMN "totalAmount" TYPE DECIMAL(12, 2)
  USING ROUND(CAST("totalAmount" AS NUMERIC), 2);

ALTER TABLE "invoice_items"
  ALTER COLUMN "unitPrice" TYPE DECIMAL(12, 2)
  USING ROUND(CAST("unitPrice" AS NUMERIC), 2),
  ALTER COLUMN "subtotal" TYPE DECIMAL(12, 2)
  USING ROUND(CAST("subtotal" AS NUMERIC), 2);

-- 2. Nuevas columnas de trazabilidad de cobro, anulación e idempotencia
ALTER TABLE "stock_movements"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paidById" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelReason" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "cancelReason" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- 3. Índices de unicidad para claves de idempotencia
CREATE UNIQUE INDEX IF NOT EXISTS "stock_movements_idempotencyKey_key"
  ON "stock_movements"("idempotencyKey");

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_idempotencyKey_key"
  ON "invoices"("idempotencyKey");

CREATE UNIQUE INDEX IF NOT EXISTS "appointments_idempotencyKey_key"
  ON "appointments"("idempotencyKey");

-- 4. Índices compuestos para consultas de agenda, historia, facturación y movimientos (F14 / T09)
CREATE INDEX IF NOT EXISTS "appointments_doctorId_date_idx"
  ON "appointments"("doctorId", "date");

CREATE INDEX IF NOT EXISTS "appointments_patientId_date_idx"
  ON "appointments"("patientId", "date");

CREATE INDEX IF NOT EXISTS "medical_records_patientId_createdAt_idx"
  ON "medical_records"("patientId", "createdAt");

CREATE INDEX IF NOT EXISTS "invoices_patientId_createdAt_idx"
  ON "invoices"("patientId", "createdAt");

CREATE INDEX IF NOT EXISTS "stock_movements_productId_createdAt_idx"
  ON "stock_movements"("productId", "createdAt");

-- 5. Restricciones CHECK de integridad de dominio (T08 / F05 / T10)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_quantity_non_negative_chk'
  ) THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "products_quantity_non_negative_chk" CHECK ("quantity" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_min_stock_non_negative_chk'
  ) THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "products_min_stock_non_negative_chk" CHECK ("minStock" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_quantity_positive_chk'
  ) THEN
    ALTER TABLE "stock_movements"
      ADD CONSTRAINT "stock_movements_quantity_positive_chk" CHECK ("quantity" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_total_amount_non_negative_chk'
  ) THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_total_amount_non_negative_chk" CHECK ("totalAmount" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_quantity_positive_chk'
  ) THEN
    ALTER TABLE "invoice_items"
      ADD CONSTRAINT "invoice_items_quantity_positive_chk" CHECK ("quantity" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_unit_price_non_negative_chk'
  ) THEN
    ALTER TABLE "invoice_items"
      ADD CONSTRAINT "invoice_items_unit_price_non_negative_chk" CHECK ("unitPrice" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_duration_valid_chk'
  ) THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_duration_valid_chk" CHECK ("duration" >= 15 AND "duration" <= 240);
  END IF;
END $$;
