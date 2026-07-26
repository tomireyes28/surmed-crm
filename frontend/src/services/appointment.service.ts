import { api } from './api';
import { Appointment, CreateAppointmentFormValues } from '../schemas/appointment.schema';

export const appointmentService = {
  getAppointments: async (): Promise<Appointment[]> => {
    const { data } = await api.get('/appointments');
    return data;
  },

  createAppointment: async (appointmentData: CreateAppointmentFormValues): Promise<Appointment> => {
    const { data } = await api.post('/appointments', appointmentData);
    return data;
  },

  // --- NUEVO: Función para actualizar estado ---
  updateStatus: async (id: string, status: string): Promise<Appointment> => {
    const { data } = await api.patch(`/appointments/${id}/status`, { status });
    return data;
  },
};