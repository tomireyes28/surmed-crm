import { api } from './api';
import { PageResult } from './pagination';
import {
  Product,
  ProductFormValues,
  MovementFormValues,
} from '../schemas/inventory.schema';

export interface UpdateProductDto {
  name?: string;
  description?: string;
  minStock?: number;
  price?: number;
  category?: 'INSUMO_MEDICO' | 'OFICINA' | 'ACTIVO_FIJO';
}

export const inventoryService = {
  getProductPage: async (page: number, includeInactive: boolean, search: string, category: string): Promise<PageResult<Product>> => {
    const { data } = await api.get<PageResult<Product>>('/inventory/products/page', { params: { page, limit: 25, includeInactive, search, category } });
    return data;
  },
  getProducts: async (includeInactive: boolean = false): Promise<Product[]> => {
    const { data } = await api.get<Product[]>('/inventory/products', {
      params: includeInactive ? { includeInactive: 'true' } : undefined,
    });
    return data;
  },

  getById: async (id: string): Promise<Product> => {
    const { data } = await api.get<Product>(`/inventory/products/${id}`);
    return data;
  },

  createProduct: async (product: ProductFormValues) => {
    const { data } = await api.post<Product>('/inventory/products', product);
    return data;
  },

  updateProduct: async (id: string, productData: UpdateProductDto) => {
    const { data } = await api.patch<Product>(
      `/inventory/products/${id}`,
      productData,
    );
    return data;
  },

  deactivateProduct: async (id: string) => {
    const { data } = await api.delete<Product>(`/inventory/products/${id}`);
    return data;
  },

  reactivateProduct: async (id: string) => {
    const { data } = await api.patch<Product>(
      `/inventory/products/${id}/reactivate`,
    );
    return data;
  },

  registerMovement: async (
    movement: MovementFormValues,
    idempotencyKey?: string,
  ) => {
    const { data } = await api.post('/inventory/movements', movement, {
      headers: idempotencyKey
        ? { 'Idempotency-Key': idempotencyKey }
        : undefined,
    });
    return data;
  },
};
