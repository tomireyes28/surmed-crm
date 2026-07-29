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

// 2. Tu interfaz original para los selects de médicos (mantenida por compatibilidad)
export interface UserDoctor {
  id: string;
  name: string;
  role: string;
}

// 3. DTO para tipar estrictamente lo que enviamos al crear
export interface CreateUserDto {
  name: string;
  email: string;
  password?: string;
  role: string;
  specialtyId?: string;
}

// 4. NUEVO: DTO para tipar lo que enviamos al actualizar
export interface UpdateUserDto {
  name?: string;
  email?: string;
  role?: 'ADMIN' | 'MEDICO' | 'RECEPCION';
}

export const usersService = {
  // Obtener todo el staff para la tabla general
  getAll: async (): Promise<User[]> => {
    const { data } = await api.get<User[]>('/users');
    return data;
  },

  // Tu función original, pero ahora aprovecha el filtro del backend
  getDoctors: async (): Promise<UserDoctor[]> => {
    // Como en el backend le agregamos el @Query('role'), 
    // ahora podemos pedirle a la API que nos devuelva SOLO los médicos directo desde la base de datos.
    const { data } = await api.get<UserDoctor[]>('/users?role=MEDICO');
    return data;
  },

  // Crear un nuevo integrante del equipo
  create: async (userData: CreateUserDto): Promise<User> => {
    const { data } = await api.post<User>('/users', userData);
    return data;
  },

  // --- NUEVAS FUNCIONES PARA EDICIÓN Y BORRADO LÓGICO ---

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
  }
};