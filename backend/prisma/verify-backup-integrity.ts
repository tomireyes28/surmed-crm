import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { listObjects } from '../ops/backup-common.cjs';

export interface StorageReconciliationReport {
  referencedPathsCount: number;
  storageObjectsCount: number;
  missingInStorage: string[];
  orphanInStorage: string[];
  isConsistent: boolean;
}

/**
 * Concilia las rutas de adjuntos clínicos registradas en PostgreSQL con los objetos
 * efectivamente presentes en el bucket privado de almacenamiento (T11 / T13).
 */
export function reconcileClinicalAttachments(
  referencedPaths: readonly string[],
  storagePaths: readonly string[],
): StorageReconciliationReport {
  const refSet = new Set(referencedPaths.filter(Boolean));
  const storageSet = new Set(storagePaths.filter(Boolean));

  const missingInStorage: string[] = [];
  for (const ref of refSet) {
    if (!storageSet.has(ref)) {
      missingInStorage.push(ref);
    }
  }

  const orphanInStorage: string[] = [];
  for (const obj of storageSet) {
    if (!refSet.has(obj)) {
      orphanInStorage.push(obj);
    }
  }

  return {
    referencedPathsCount: refSet.size,
    storageObjectsCount: storageSet.size,
    missingInStorage: missingInStorage.sort(),
    orphanInStorage: orphanInStorage.sort(),
    isConsistent: missingInStorage.length === 0 && orphanInStorage.length === 0,
  };
}

async function runCli() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL es obligatorio para verificar integridad.');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const [records, attachmentRows] = await Promise.all([
      prisma.medicalRecord.findMany({
        select: { id: true, attachments: true },
      }),
      prisma.medicalAttachment.findMany({
        select: { storagePath: true, isRevoked: true },
      }),
    ]);

    const referencedPaths = new Set<string>();
    for (const rec of records) {
      for (const p of rec.attachments) {
        if (p) referencedPaths.add(p);
      }
    }
    for (const att of attachmentRows) {
      // Revocation denies downloads; it does not remove the retained object.
      if (att.storagePath) {
        referencedPaths.add(att.storagePath);
      }
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.log(
        JSON.stringify(
          {
            event: 'BACKUP_DB_SUMMARY',
            medicalRecordsCount: records.length,
            referencedAttachmentsCount: referencedPaths.size,
            storageCheck: 'SKIPPED_NO_CREDENTIALS',
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const storagePaths: string[] = await listObjects(
      supabase,
      process.env.SUPABASE_MEDICAL_BUCKET || 'medical-records',
    );

    const report = reconcileClinicalAttachments(
      Array.from(referencedPaths),
      storagePaths,
    );

    console.log(
      JSON.stringify(
        {
          event: 'BACKUP_STORAGE_RECONCILIATION',
          timestamp: new Date().toISOString(),
          ...report,
        },
        null,
        2,
      ),
    );

    if (!report.isConsistent) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  runCli().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error(`[ERROR] ${msg}`);
    process.exit(1);
  });
}
