-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('INSUMO_MEDICO', 'OFICINA', 'ACTIVO_FIJO');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "category" "ProductCategory" NOT NULL DEFAULT 'INSUMO_MEDICO';
