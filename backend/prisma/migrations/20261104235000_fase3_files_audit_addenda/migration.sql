-- Fase 3 (T11, T12, T13): Metadatos de archivos clínicos (MedicalAttachment),
-- adendas inmutables en historias clínicas (parentRecordId) y registro de auditoría (AuditLog).

-- 1. Columna parentRecordId para adendas clínicas (T12)
ALTER TABLE "medical_records"
  ADD COLUMN IF NOT EXISTS "parentRecordId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'medical_records_parentRecordId_fkey'
  ) THEN
    ALTER TABLE "medical_records"
      ADD CONSTRAINT "medical_records_parentRecordId_fkey"
      FOREIGN KEY ("parentRecordId") REFERENCES "medical_records"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "medical_records_parentRecordId_idx"
  ON "medical_records"("parentRecordId");

-- 2. Tabla de metadatos verificados de adjuntos clínicos (T11)
CREATE TABLE IF NOT EXISTS "medical_attachments" (
  "id" TEXT NOT NULL,
  "medicalRecordId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "scanStatus" TEXT NOT NULL DEFAULT 'CLEAN_MAGIC_VERIFIED',
  "isRevoked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "medical_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "medical_attachments_size_positive_chk" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760)
);

CREATE UNIQUE INDEX IF NOT EXISTS "medical_attachments_storagePath_key"
  ON "medical_attachments"("storagePath");

CREATE INDEX IF NOT EXISTS "medical_attachments_patientId_createdAt_idx"
  ON "medical_attachments"("patientId", "createdAt");

CREATE INDEX IF NOT EXISTS "medical_attachments_medicalRecordId_idx"
  ON "medical_attachments"("medicalRecordId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'medical_attachments_medicalRecordId_fkey'
  ) THEN
    ALTER TABLE "medical_attachments"
      ADD CONSTRAINT "medical_attachments_medicalRecordId_fkey"
      FOREIGN KEY ("medicalRecordId") REFERENCES "medical_records"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Tabla de auditoría clínica y administrativa (T12)
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "actorRole" TEXT,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "resourceId" TEXT,
  "patientId" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_resource_resourceId_createdAt_idx"
  ON "audit_logs"("resource", "resourceId", "createdAt");

CREATE INDEX IF NOT EXISTS "audit_logs_patientId_createdAt_idx"
  ON "audit_logs"("patientId", "createdAt");

CREATE INDEX IF NOT EXISTS "audit_logs_actorId_createdAt_idx"
  ON "audit_logs"("actorId", "createdAt");
