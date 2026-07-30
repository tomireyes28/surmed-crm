import { api } from './api';
import { Patient, PatientFormValues } from '../schemas/patient.schema';

export interface UpdatePatientDto {
  firstName?: string;
  lastName?: string;
  documentId?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  birthDate?: string;
}

// NUEVO: Interfaz para la respuesta del backend
export interface PaginatedPatients {
  data: Patient[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const patientsService = {
  // NUEVO: Agregamos parámetros por defecto (página 1, límite 10)
  getAll: async (page: number = 1, limit: number = 10): Promise<PaginatedPatients> => {
    const { data } = await api.get('/patients', {
      params: { page, limit }
    });
    return data;
  },
  
  getById: async (id: string) => {
    const { data } = await api.get(`/patients/${id}`);
    return data;
  },

  create: async (patient: PatientFormValues) => {
    const { data } = await api.post('/patients', patient);
    return data;
  },

  update: async (id: string, patientData: UpdatePatientDto): Promise<Patient> => {
    const { data } = await api.patch<Patient>(`/patients/${id}`, patientData);
    return data;
  },

  archive: async (id: string): Promise<Patient> => {
    const { data } = await api.delete<Patient>(`/patients/${id}`);
    return data;
  } 
};