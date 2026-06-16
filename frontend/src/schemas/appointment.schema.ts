import * as z from 'zod';

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'IN_WAITING_ROOM' | 'ATTENDED' | 'CANCELLED';

// Esquema para validar la creación de un turno en el futuro formulario
export const createAppointmentSchema = z.object({
  patientId: z.string().min(1, 'El paciente es obligatorio'),
  doctorId: z.string().min(1, 'El médico es obligatorio'),
  specialtyId: z.string().min(1, 'La especialidad es obligatoria'),
  date: z.string().min(1, 'La fecha y hora son obligatorias'),
  duration: z.number().min(15),
  notes: z.string().optional(),
});

export type CreateAppointmentFormValues = z.infer<typeof createAppointmentSchema>;

// Interfaces limpias para leer los datos que vienen del backend
export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  specialtyId: string;
  date: string; // ISO string que viene de la API
  duration: number;
  status: AppointmentStatus;
  notes?: string;
  
  // Datos cruzados que le pedimos a Prisma que incluya
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    documentId: string;
  };
  doctor: {
    id: string;
    name: string;
  };
  specialty: {
    id: string;
    name: string;
  };
}