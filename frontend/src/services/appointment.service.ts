import { api } from './api';
import {
  Appointment,
  CreateAppointmentFormValues,
} from '../schemas/appointment.schema';

export const appointmentService = {
  getAppointments: async (params?: {
    from?: string;
    to?: string;
    doctorId?: string;
    patientId?: string;
    status?: string;
  }): Promise<Appointment[]> => {
    const { data } = await api.get<Appointment[]>('/appointments', {
      params,
    });
    return data;
  },

  createAppointment: async (
    appointmentData: CreateAppointmentFormValues,
    idempotencyKey?: string,
  ): Promise<Appointment> => {
    const { data } = await api.post<Appointment>(
      '/appointments',
      appointmentData,
      {
        headers: idempotencyKey
          ? { 'Idempotency-Key': idempotencyKey }
          : undefined,
      },
    );
    return data;
  },

  updateStatus: async (
    id: string,
    status: string,
    cancelReason?: string,
  ): Promise<Appointment> => {
    const { data } = await api.patch<Appointment>(
      `/appointments/${id}/status`,
      {
        status,
        ...(cancelReason ? { cancelReason } : {}),
      },
    );
    return data;
  },
};
