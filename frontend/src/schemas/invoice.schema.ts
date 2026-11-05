import * as z from 'zod';

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(2, { message: 'Falta descripción' }),
  quantity: z.number().int().min(1, { message: 'Mín. 1' }).max(10000),
  unitPrice: z.number().min(0.01, { message: 'El precio debe ser mayor a 0' }),
});

export const invoiceSchema = z.object({
  patientId: z.string().min(1, { message: 'Debe seleccionar un paciente' }),
  items: z
    .array(invoiceItemSchema)
    .min(1, { message: 'Debe agregar al menos un ítem a cobrar' }),
  payNow: z.boolean().optional(),
  idempotencyKey: z.string().optional(),
});

export type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export interface Invoice {
  id: string;
  patientId: string;
  totalAmount: number;
  createdAt: string;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  paidAt?: string | null;
  paidById?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancelReason?: string | null;
  patient: {
    firstName: string;
    lastName: string;
    documentId: string;
  };
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
}
