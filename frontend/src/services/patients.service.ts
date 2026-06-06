import { api } from './api';
import { Patient, PatientFormValues } from '../schemas/patient.schema';

export const patientsService = {
  getAll: async (): Promise<Patient[]> => {
    const { data } = await api.get('/patients');
    return data;
  },
  
  getById: async (id: string) => {
    const { data } = await api.get(`/patients/${id}`);
    return data;
  },

  create: async (patient: PatientFormValues) => {
    const { data } = await api.post('/patients', patient);
    return data;
  }
};