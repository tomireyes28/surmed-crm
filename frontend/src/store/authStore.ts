import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'ADMIN' | 'MEDICO' | 'RECEPCION';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface AuthState {
  user: AuthUser | null;
  setAuth: (_token: string, user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

// Persistimos únicamente los datos básicos del usuario para la UI;
// el token JWT vive en una única fuente (cookie) para no duplicar secretos en localStorage (S06 / T03).
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setAuth: (_token, user) => set({ user }),
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    {
      name: 'surmed-auth-storage',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
