import { api } from './api';
import { Specialty } from './specialties.service';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MEDICO' | 'RECEPCION' | string;
  isActive?: boolean;
  specialties: Specialty[];
}

export interface UserDoctor {
  id: string;
  name: string;
  role: string;
  specialties?: Specialty[];
}

export interface CreateUserDto {
  name: string;
  email: string;
  password?: string;
  role: string;
  specialtyId?: string;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  role?: 'ADMIN' | 'MEDICO' | 'RECEPCION';
  password?: string;
  specialtyId?: string;
}

export const usersService = {
  getAll: async (includeInactive: boolean = false): Promise<User[]> => {
    const { data } = await api.get<User[]>('/users', {
      params: includeInactive ? { includeInactive: 'true' } : undefined,
    });
    return data;
  },

  getDoctors: async (): Promise<UserDoctor[]> => {
    const { data } = await api.get<UserDoctor[]>('/users?role=MEDICO');
    return data;
  },

  create: async (userData: CreateUserDto): Promise<User> => {
    const { data } = await api.post<User>('/users', userData);
    return data;
  },

  getById: async (id: string): Promise<User> => {
    const { data } = await api.get<User>(`/users/${id}`);
    return data;
  },

  update: async (id: string, userData: UpdateUserDto): Promise<User> => {
    const { data } = await api.patch<User>(`/users/${id}`, userData);
    return data;
  },

  deactivate: async (id: string): Promise<User> => {
    const { data } = await api.delete<User>(`/users/${id}`);
    return data;
  },

  reactivate: async (id: string): Promise<User> => {
    const { data } = await api.patch<User>(`/users/${id}/reactivate`);
    return data;
  },
};
