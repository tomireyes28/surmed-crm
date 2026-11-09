import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-inventory.dto';
import { UpdateProductDto } from './dto/update-inventory.dto';
import { StockMovementDto } from './dto/stock-movement.dto';
import { serializable } from '../common/utils/transaction.util';
import {
  idempotencyKey,
  fingerprint,
  assertReplay,
} from '../common/utils/idempotency.util';
import { toDecimal, toMoneyNumber } from '../common/utils/money.util';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  private serializeProduct(product: Product) {
    return {
      ...product,
      price:
        product.price !== null && product.price !== undefined
          ? toMoneyNumber(product.price)
          : null,
      isLowStock:
        product.category === 'INSUMO_MEDICO' &&
        product.quantity <= product.minStock,
    };
  }

  // 1. Crear un producto nuevo (arranca con stock 0 por defecto)
  async createProduct(dto: CreateProductDto) {
    const created = await this.prisma.product.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || undefined,
        minStock: dto.minStock,
        price: dto.price !== undefined ? toDecimal(dto.price) : undefined,
        category: dto.category,
      },
    });
    return this.serializeProduct(created);
  }

  // 2. Traer listado de inventario con filtro opcional de búsqueda, categoría y archivados (F14 / F16)
  async findAllProducts(
    search?: string,
    category?: string,
    includeInactive: boolean = false,
  ) {
    const trimmedSearch = search?.trim();
    const whereClause: Prisma.ProductWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(category && category !== 'TODOS'
        ? { category: category as Product['category'] }
        : {}),
      ...(trimmedSearch
        ? {
            OR: [
              { name: { contains: trimmedSearch, mode: 'insensitive' } },
              { description: { contains: trimmedSearch, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const products = await this.prisma.product.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
    });

    return products.map((product) => this.serializeProduct(product));
  }

  // 3. Traer un solo producto
  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    return this.serializeProduct(product);
  }

  // 4. Actualizar datos administrativos de un producto (S05 / T07)
  // Rechaza modificaciones directas de `quantity`, `isActive` o relaciones.
  async updateProduct(id: string, data: UpdateProductDto) {
    const raw = data as Record<string, unknown>;
    if (
      raw.quantity !== undefined ||
      raw.isActive !== undefined ||
      raw.movements !== undefined
    ) {
      throw new BadRequestException(
        'No se permite modificar el stock ni el estado interno directamente mediante edición de producto.',
      );
    }

    await this.findOne(id);

    const updateData: Prisma.ProductUpdateInput = {};
    if (data.name !== undefined) {
      updateData.name = data.name.trim();
    }
    if (data.description !== undefined) {
      updateData.description = data.description
        ? data.description.trim()
        : null;
    }
    if (data.minStock !== undefined) {
      if (!Number.isInteger(data.minStock) || data.minStock < 0) {
        throw new BadRequestException(
          'El stock mínimo debe ser un entero mayor o igual a 0.',
        );
      }
      updateData.minStock = data.minStock;
    }
    if (data.price !== undefined) {
      if (data.price !== null && data.price < 0) {
        throw new BadRequestException('El precio no puede ser negativo.');
      }
      updateData.price = data.price !== null ? toDecimal(data.price) : null;
    }
    if (data.category !== undefined) {
      updateData.category = data.category;
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: updateData,
    });

    return this.serializeProduct(updated);
  }

  // 5. Borrado Lógico (Desactivar) y Reactivación explícita (F16)
  async deactivateProduct(id: string) {
    await this.findOne(id);
    const updated = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    return this.serializeProduct(updated);
  }

  async reactivateProduct(id: string) {
    await this.findOne(id);
    const updated = await this.prisma.product.update({
      where: { id },
      data: { isActive: true },
    });
    return this.serializeProduct(updated);
  }

  // 6. Registrar un ingreso o consumo de stock de forma atómica y trazable (T08 / F05 / F16 / F22)
  async registerMovement(
    dto: StockMovementDto,
    userId: string,
    idempotencyHeader?: string,
  ) {
    if (!Number.isInteger(dto.quantity) || dto.quantity < 1) {
      throw new BadRequestException(
        'La cantidad del movimiento debe ser un entero mayor o igual a 1.',
      );
    }

    const effectiveKey = idempotencyKey(dto.idempotencyKey, idempotencyHeader);
    const requestFingerprint = fingerprint('inventory.movement', userId, {
      productId: dto.productId,
      type: dto.type,
      quantity: dto.quantity,
      notes: dto.notes?.trim() || '',
    });

    return serializable(
      this.prisma,
      async (tx) => {
        // Idempotencia: si ya se registró un movimiento con esta clave, devolver el resultado previo sin descontar dos veces
        if (effectiveKey) {
          const existingMovement = await tx.stockMovement.findUnique({
            where: { idempotencyKey: effectiveKey },
          });
          if (existingMovement) {
            assertReplay(
              existingMovement.requestFingerprint,
              requestFingerprint,
            );
            const currentProduct = await tx.product.findUnique({
              where: { id: dto.productId },
            });
            if (!currentProduct) {
              throw new NotFoundException('Producto no encontrado');
            }
            return {
              movement: existingMovement,
              updatedProduct: this.serializeProduct(currentProduct),
              idempotentReplay: true,
            };
          }
        }

        const product = await tx.product.findUnique({
          where: { id: dto.productId },
        });

        if (!product) {
          throw new NotFoundException('Producto no encontrado');
        }

        if (!product.isActive) {
          throw new BadRequestException(
            'No se pueden registrar movimientos sobre un producto desactivado.',
          );
        }

        if (dto.type === 'OUT' && product.quantity < dto.quantity) {
          throw new BadRequestException(
            `Stock insuficiente. Quedan ${product.quantity} unidades.`,
          );
        }

        // Actualización condicional atómica dentro de la transacción (F05 / T08)
        const conditionalUpdate = await tx.product.updateMany({
          where: {
            id: dto.productId,
            isActive: true,
            ...(dto.type === 'OUT' ? { quantity: { gte: dto.quantity } } : {}),
          },
          data: {
            quantity:
              dto.type === 'IN'
                ? { increment: dto.quantity }
                : { decrement: dto.quantity },
          },
        });

        if (conditionalUpdate.count === 0) {
          throw new BadRequestException(
            `Stock insuficiente o producto inactivo al confirmar el movimiento.`,
          );
        }

        const reloaded = await tx.product.findUnique({
          where: { id: dto.productId },
        });
        if (!reloaded) {
          throw new NotFoundException('Producto no encontrado');
        }
        const updatedProduct = reloaded;

        const movement = await tx.stockMovement.create({
          data: {
            productId: dto.productId,
            userId,
            type: dto.type,
            quantity: dto.quantity,
            notes: dto.notes?.trim() || undefined,
            ...(effectiveKey
              ? { idempotencyKey: effectiveKey, requestFingerprint }
              : {}),
          },
        });

        return {
          movement,
          updatedProduct: this.serializeProduct(updatedProduct),
        };
      },
      Boolean(effectiveKey),
    );
  }
}
