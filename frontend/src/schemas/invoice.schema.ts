import * as z from 'zod';

// Esquema para cada línea de la factura (ej: "Consulta general", 1, $5000)
export const invoiceItemSchema = z.object({
  description: z.string().min(2, { message: 'Falta descripción' }),
  quantity: z.number().min(1, { message: 'Mín. 1' }),
  unitPrice: z.number().min(0, { message: 'Precio inválido' }),
});

// Esquema principal de la factura
export const invoiceSchema = z.object({
  patientId: z.string().min(1, { message: 'Debe seleccionar un paciente' }),
  items: z.array(invoiceItemSchema).min(1, { message: 'Debe agregar al menos un ítem a cobrar' }),
});

export type InvoiceFormValues = z.infer<typeof invoiceSchema>;

// Interfaz para lo que nos devuelve el backend al listar
export interface Invoice {
  id: string;
  patientId: string;
  totalAmount: number;
  createdAt: string;
  patient: {
    firstName: string;
    lastName: string;
    documentId: string;
  };
}