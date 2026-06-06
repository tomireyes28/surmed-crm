import * as z from 'zod';

export const patientSchema = z.object({
  documentId: z.string().min(5, { message: 'El documento debe tener al menos 5 caracteres' }),
  firstName: z.string().min(2, { message: 'El nombre es obligatorio' }),
  lastName: z.string().min(2, { message: 'El apellido es obligatorio' }),
  email: z.string().email({ message: 'Email inválido' }).optional().or(z.literal('')),
  phone: z.string().optional(),
  birthDate: z.string().min(1, { message: 'La fecha de nacimiento es obligatoria' }),
  address: z.string().optional(),
});

export type PatientFormValues = z.infer<typeof patientSchema>;

// Interfaz para cuando recibimos los pacientes del backend
export interface Patient {
  id: string;
  documentId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  birthDate: string;
  address: string | null;
  createdAt: string;
}