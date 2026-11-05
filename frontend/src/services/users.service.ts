import { api } from './api';
import { Specialty } from './specialties.service';

// 1. Interfaz completa para la vista general de Staff
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  specialties: Specialty[];
}

// 2. Interfaz para los selects de médicos (incluye especialidades asociadas)
export interface UserDoctor {
  id: string;
  name: string;
  role: string;
  specialties?: Specialty[];
}

// 3. DTO para tipar estrictamente lo que enviamos al crear
export interface CreateUserDto {
  name: string;
  email: string;
  password?: string;
  role: string;
  specialtyId?: string;
}

// 4. DTO para tipar lo que enviamos al actualizar
export interface UpdateUserDto {
  name?: string;
  email?: string;
  role?: 'ADMIN' | 'MEDICO' | 'RECEPCION';
}

export const usersService = {
  getAll: async (): Promise<User[]> => {
    const { data } = await api.get<User[]>('/users');
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
};
