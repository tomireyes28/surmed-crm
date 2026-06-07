import { api } from './api';
import { Product, ProductFormValues, MovementFormValues } from '../schemas/inventory.schema';

export const inventoryService = {
  getProducts: async (): Promise<Product[]> => {
    const { data } = await api.get('/inventory/products');
    return data;
  },

  createProduct: async (product: ProductFormValues) => {
    const { data } = await api.post('/inventory/products', product);
    return data;
  },

  registerMovement: async (movement: MovementFormValues) => {
    const { data } = await api.post('/inventory/movements', movement);
    return data;
  }
};