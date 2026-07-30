import { api } from './api';

export interface CreateSpecialtyDto {
  name: string;
  description?: string;
}

// Extendemos la interfaz para incluir el ID y el contador de médicos
export interface SpecialtyWithCount extends CreateSpecialtyDto {
  id: string;
  _count?: {
    doctors: number;
  };
}

export const specialtiesService = {
  getAll: async (): Promise<SpecialtyWithCount[]> => {
    const { data } = await api.get('/specialties');
    return data;
  },

  getById: async (id: string): Promise<SpecialtyWithCount> => {
    const { data } = await api.get(`/specialties/${id}`);
    return data;
  },

  create: async (specialty: CreateSpecialtyDto): Promise<SpecialtyWithCount> => {
    const { data } = await api.post('/specialties', specialty);
    return data;
  },

  update: async (id: string, specialty: Partial<CreateSpecialtyDto>): Promise<SpecialtyWithCount> => {
    const { data } = await api.patch(`/specialties/${id}`, specialty);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/specialties/${id}`);
  }
};