import { api } from './api';
import { Product, ProductFormValues, MovementFormValues } from '../schemas/inventory.schema';

export interface UpdateProductDto {
  name?: string;
  description?: string;
  minStock?: number;
  price?: number;
  category?: 'INSUMO_MEDICO' | 'OFICINA' | 'ACTIVO_FIJO';
}

export const inventoryService = {
  getProducts: async (): Promise<Product[]> => {
    const { data } = await api.get('/inventory/products');
    return data;
  },

  getById: async (id: string): Promise<Product> => {
    const { data } = await api.get(`/inventory/products/${id}`);
    return data;
  },

  createProduct: async (product: ProductFormValues) => {
    const { data } = await api.post('/inventory/products', product);
    return data;
  },

  updateProduct: async (id: string, productData: UpdateProductDto) => {
    const { data } = await api.patch(`/inventory/products/${id}`, productData);
    return data;
  },

  deactivateProduct: async (id: string) => {
    const { data } = await api.delete(`/inventory/products/${id}`);
    return data;
  },

  registerMovement: async (movement: MovementFormValues) => {
    const { data } = await api.post('/inventory/movements', movement);
    return data;
  }
};