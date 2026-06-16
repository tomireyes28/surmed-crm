import { api } from './api';

export interface Specialty {
  id: string;
  name: string;
  description?: string;
}

export const specialtiesService = {
  getAll: async (): Promise<Specialty[]> => {
    const { data } = await api.get('/specialties');
    return data;
  }
};