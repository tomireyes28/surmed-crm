import { api } from './api';

export interface CreateSpecialtyDto {
  name: string;
  description?: string;
}

export interface Specialty extends CreateSpecialtyDto {
  id: string;
}

export interface SpecialtyWithCount extends Specialty {
  _count?: {
    doctors: number;
  };
}

export const specialtiesService = {
  getAll: async (): Promise<SpecialtyWithCount[]> => {
    const { data } = await api.get<SpecialtyWithCount[]>('/specialties');
    return data;
  },

  getById: async (id: string): Promise<SpecialtyWithCount> => {
    const { data } = await api.get<SpecialtyWithCount>(`/specialties/${id}`);
    return data;
  },

  create: async (
    specialty: CreateSpecialtyDto,
  ): Promise<SpecialtyWithCount> => {
    const { data } = await api.post<SpecialtyWithCount>(
      '/specialties',
      specialty,
    );
    return data;
  },

  update: async (
    id: string,
    specialty: Partial<CreateSpecialtyDto>,
  ): Promise<SpecialtyWithCount> => {
    const { data } = await api.patch<SpecialtyWithCount>(
      `/specialties/${id}`,
      specialty,
    );
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/specialties/${id}`);
  },
};
