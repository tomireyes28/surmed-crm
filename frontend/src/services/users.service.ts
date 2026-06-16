import { api } from './api';

export interface UserDoctor {
  id: string;
  name: string;
  role: string;
}

export const usersService = {
  getDoctors: async (): Promise<UserDoctor[]> => {
    const { data } = await api.get('/users');
    // Filtramos solo los que son médicos por seguridad
    return data.filter((user: UserDoctor) => user.role === 'MEDICO');
  }
};