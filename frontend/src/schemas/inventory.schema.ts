import * as z from 'zod';

export const productSchema = z.object({
  name: z.string().min(2, { message: 'El nombre es obligatorio' }),
  description: z.string().optional(),
  // Usamos .number() limpio en vez de coerce
  minStock: z.number().min(0, { message: 'El stock mínimo no puede ser negativo' }),
  // Permitimos que sea un número opcional, o que se ignore si está vacío (NaN)
  price: z.number().min(0, { message: 'El precio no puede ser negativo' }).optional().or(z.nan().transform(() => undefined)),
});

export const movementSchema = z.object({
  productId: z.string().min(1, { message: 'Debe seleccionar un producto' }),
  type: z.enum(['IN', 'OUT'], { message: 'Debe seleccionar Ingreso o Egreso' }),
  quantity: z.number().min(1, { message: 'La cantidad debe ser mayor a 0' }),
  notes: z.string().optional(),
});

export type ProductFormValues = z.infer<typeof productSchema>;
export type MovementFormValues = z.infer<typeof movementSchema>;

export interface Product {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  minStock: number;
  price: number | null;
  isLowStock: boolean;
}