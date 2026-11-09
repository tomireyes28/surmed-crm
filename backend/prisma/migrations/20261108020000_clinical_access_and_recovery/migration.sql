ALTER TABLE "auth_sessions" ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "clinical_access" (
  "patientId" TEXT NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "doctorId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "grantedById" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3),
  PRIMARY KEY ("patientId", "doctorId")
);
CREATE TABLE "recovery_tokens" (
  "tokenHash" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "recovery_tokens_userId_idx" ON "recovery_tokens"("userId");
CREATE INDEX "recovery_tokens_expiresAt_idx" ON "recovery_tokens"("expiresAt");
CREATE TABLE "auth_rate_buckets" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "auth_rate_buckets_expiresAt_idx" ON "auth_rate_buckets"("expiresAt");
