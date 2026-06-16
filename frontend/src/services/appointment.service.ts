import {api} from './api';
import { Appointment, CreateAppointmentFormValues } from '../schemas/appointment.schema';

export const appointmentService = {
  // Traer todos los turnos
  getAppointments: async (): Promise<Appointment[]> => {
    const { data } = await api.get('/appointments');
    return data;
  },

  // Crear un nuevo turno
  createAppointment: async (appointmentData: CreateAppointmentFormValues): Promise<Appointment> => {
    const { data } = await api.post('/appointments', appointmentData);
    return data;
  },
};