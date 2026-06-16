import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-inventory.dto';
import { StockMovementDto } from './dto/stock-movement.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // 1. Crear un producto nuevo (arranca con stock 0 por defecto)
  createProduct(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: dto,
    });
  }

  // 2. Traer todo el inventario (y avisar si algo tiene poco stock)
  async findAllProducts() {
    const products = await this.prisma.product.findMany({
      orderBy: { name: 'asc' },
    });

    return products.map(product => ({
      ...product,
      // Solo aplicamos la alerta roja si es Insumo Médico Y el stock es bajo
      isLowStock: product.category === 'INSUMO_MEDICO' && product.quantity <= product.minStock,
    }));
  }

  // 3. Registrar un ingreso o consumo de stock
  async registerMovement(dto: StockMovementDto, userId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (dto.type === 'OUT' && product.quantity < dto.quantity) {
      throw new BadRequestException(`Stock insuficiente. Quedan ${product.quantity} unidades.`);
    }

    // Usamos $transaction para asegurar que ambas operaciones (crear movimiento y actualizar stock) se hagan juntas
    return this.prisma.$transaction(async (prisma) => {
      // A. Guardamos el registro de quién lo sacó/metió
      const movement = await prisma.stockMovement.create({
        data: {
          productId: dto.productId,
          userId: userId,
          type: dto.type,
          quantity: dto.quantity,
          notes: dto.notes,
        },
      });

      // B. Actualizamos la cantidad total del producto
      const updatedProduct = await prisma.product.update({
        where: { id: dto.productId },
        data: {
          quantity: dto.type === 'IN' 
            ? { increment: dto.quantity } 
            : { decrement: dto.quantity },
        },
      });

      return { movement, updatedProduct };
    });
  }
}