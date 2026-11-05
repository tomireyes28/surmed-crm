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
  getAll: async (
    page: number = 1,
    limit: number = 10,
    search?: string,
  ): Promise<PaginatedPatients> => {
    const trimmedSearch = search?.trim();
    const { data } = await api.get<PaginatedPatients>('/patients', {
      params: {
        page,
        limit,
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
      },
    });
    return data;
  },

  getById: async (id: string): Promise<Patient> => {
    const { data } = await api.get<Patient>(`/patients/${id}`);
    return data;
  },

  create: async (patient: PatientFormValues): Promise<Patient> => {
    const { data } = await api.post<Patient>('/patients', patient);
    return data;
  },

  update: async (
    id: string,
    patientData: UpdatePatientDto,
  ): Promise<Patient> => {
    const { data } = await api.patch<Patient>(`/patients/${id}`, patientData);
    return data;
  },

  archive: async (id: string): Promise<Patient> => {
    const { data } = await api.delete<Patient>(`/patients/${id}`);
    return data;
  },
};
