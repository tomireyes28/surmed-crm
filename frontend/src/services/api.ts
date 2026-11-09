import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

export const api = axios.create({
  baseURL: '/api/backend',
  headers: {
    'Content-Type': 'application/json',
    'X-Surmed-Request': '1',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl: string = error?.config?.url || '';

    // Manejo global de 401: limpia sesión y evita estados inconsistentes o bucles (S06 / T03)
    if (status === 401 && !requestUrl.includes('/auth/login') && !requestUrl.includes('/auth/recovery/redeem')) {
      useAuthStore.getState().logout();

      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.replace('/');
      }
    }

    return Promise.reject(error);
  },
);
