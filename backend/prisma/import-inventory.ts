import { PrismaClient, ProductCategory } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';

export interface ParsedInventoryItem {
  code: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
  minStock: number;
  category: ProductCategory;
  sourceFile: string;
  rowNumber: number;
}

export interface InventoryImportReport {
  dryRun: boolean;
  totalRowsEvaluated: number;
  validItems: number;
  imported: number;
  skippedExisting: number;
  invalidRows: { sourceFile: string; rowNumber: number; reason: string }[];
}

export function parseInventorySheetRows(
  rows: unknown[][],
  category: ProductCategory,
  sourceFile: string,
  startRowIndex: number = 5,
): {
  items: ParsedInventoryItem[];
  invalidRows: { sourceFile: string; rowNumber: number; reason: string }[];
} {
  const items: ParsedInventoryItem[] = [];
  const invalidRows: { sourceFile: string; rowNumber: number; reason: string }[] = [];
  const seenNamesInSheet = new Set<string>();

  for (let i = startRowIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawCode = row[1];
    const rawName = row[2];
    const rawDescription = row[3];
    const rawPrice = row[4];
    const rawQuantity = row[5];

    const isAllEmpty = [rawCode, rawName, rawDescription, rawPrice, rawQuantity].every(
      (cell) => cell === undefined || cell === null || String(cell).trim() === '',
    );
    if (isAllEmpty) continue;

    const code = rawCode !== undefined && rawCode !== null ? String(rawCode).trim() : '';
    const name = rawName !== undefined && rawName !== null ? String(rawName).trim() : '';

    // Validamos que tenga un código con guion (ej. 001-001) y nombre no vacío
    if (!code || !code.includes('-') || !name) {
      invalidRows.push({
        sourceFile,
        rowNumber: i + 1,
        reason: 'Fila omitida por no tener código válido (formato XXX-XXX) o nombre.',
      });
      continue;
    }

    const normalizedKey = name.toLowerCase();
    if (seenNamesInSheet.has(normalizedKey)) {
      invalidRows.push({
        sourceFile,
        rowNumber: i + 1,
        reason: `Producto duplicado dentro de la misma planilla: "${name}"`,
      });
      continue;
    }

    const parsedPrice =
      rawPrice !== undefined && rawPrice !== null && String(rawPrice).trim() !== ''
        ? Number.parseFloat(String(rawPrice))
        : 0;
    const parsedQuantity =
      rawQuantity !== undefined &&
      rawQuantity !== null &&
      String(rawQuantity).trim() !== ''
        ? Number.parseInt(String(rawQuantity), 10)
        : 0;

    if (
      !Number.isFinite(parsedPrice) ||
      parsedPrice < 0 ||
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 0
    ) {
      invalidRows.push({
        sourceFile,
        rowNumber: i + 1,
        reason: `Precio o cantidad inválidos/negativos para "${name}".`,
      });
      continue;
    }

    seenNamesInSheet.add(normalizedKey);
    items.push({
      code,
      name,
      description:
        rawDescription !== undefined && rawDescription !== null
          ? String(rawDescription).trim()
          : '',
      price: parsedPrice,
      quantity: parsedQuantity,
      minStock: category === 'INSUMO_MEDICO' ? 10 : 2,
      category,
      sourceFile,
      rowNumber: i + 1,
    });
  }

  return { items, invalidRows };
}

export async function importParsedInventoryItems(
  db: {
    product: {
      findFirst: (args: { where: { name: string } }) => Promise<{ id: string } | null>;
      create: (args: {
        data: {
          name: string;
          description: string;
          price: number;
          quantity: number;
          minStock: number;
          category: ProductCategory;
        };
      }) => Promise<unknown>;
    };
  },
  items: ParsedInventoryItem[],
  dryRun: boolean = false,
): Promise<{ imported: number; skippedExisting: number }> {
  let imported = 0;
  let skippedExisting = 0;

  for (const item of items) {
    const existing = await db.product.findFirst({
      where: { name: item.name },
    });

    if (existing) {
      skippedExisting++;
      continue;
    }

    if (!dryRun) {
      await db.product.create({
        data: {
          name: item.name,
          description: item.description,
          price: item.price,
          quantity: item.quantity,
          minStock: item.minStock,
          category: item.category,
        },
      });
    }

    imported++;
  }

  return { imported, skippedExisting };
}

async function runCli() {
  const dryRun =
    process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL es obligatorio para ejecutar el importador de inventario.');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const dataDir = path.join(process.cwd(), 'prisma', 'data');
  const files: { filename: string; category: ProductCategory }[] = [
    { filename: 'inv1.xlsx', category: 'ACTIVO_FIJO' },
    { filename: 'inv2.xlsx', category: 'OFICINA' },
    { filename: 'inv3.xlsx', category: 'INSUMO_MEDICO' },
    { filename: 'inv4.xlsx', category: 'INSUMO_MEDICO' },
    { filename: 'inv5.xlsx', category: 'INSUMO_MEDICO' },
  ];

  const report: InventoryImportReport = {
    dryRun,
    totalRowsEvaluated: 0,
    validItems: 0,
    imported: 0,
    skippedExisting: 0,
    invalidRows: [],
  };

  try {
    console.log(
      dryRun
        ? '🔍 Ejecutando PREVIEW (dry-run) de importación de inventario...'
        : '📦 Iniciando importación idempotente de inventario...',
    );

    for (const file of files) {
      const filePath = path.join(dataDir, file.filename);
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️ Archivo no encontrado (${file.filename}), saltando.`);
        continue;
      }

      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(worksheet, {
        header: 1,
      }) as unknown[][];

      const { items, invalidRows } = parseInventorySheetRows(
        rows,
        file.category,
        file.filename,
      );

      report.totalRowsEvaluated += Math.max(0, rows.length - 5);
      report.validItems += items.length;
      report.invalidRows.push(...invalidRows);

      const { imported, skippedExisting } = await importParsedInventoryItems(
        prisma,
        items,
        dryRun,
      );

      report.imported += imported;
      report.skippedExisting += skippedExisting;

      console.log(
        `✅ ${file.filename}: ${imported} ${
          dryRun ? 'para importar' : 'importados'
        }, ${skippedExisting} existentes omitidos, ${invalidRows.length} filas descartadas.`,
      );
    }

    console.log('\n📊 Resumen de importación:', JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Error en importación de inventario',
    );
    process.exit(1);
  });
}
