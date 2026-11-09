'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, LoginFormValues } from '../schemas/auth.schema';
import { useAuthStore } from '../store/authStore';
import { useRouter } from 'next/navigation';
import { isAxiosError } from 'axios';
import { api } from '@/services/api';

export default function LoginPage() {
  const setUser = useAuthStore((state) => state.setUser);
  const router = useRouter();
  const [loginError, setLoginError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setLoginError(null);
    try {
      const response = await api.post('/auth/login', data);
      setUser(response.data.user);

      router.push('/dashboard');
    } catch (error) {
      if (isAxiosError(error)) {
        if (error.response?.status === 429) {
          setLoginError(
            'Demasiados intentos fallidos. Por favor, espere unos minutos antes de volver a intentar.',
          );
          return;
        }
        const backendMessage = error.response?.data?.message;
        setLoginError(
          typeof backendMessage === 'string'
            ? backendMessage
            : 'Credenciales incorrectas o usuario inactivo.',
        );
      } else {
        setLoginError('No se pudo conectar con el servidor. Intente nuevamente.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-100">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Surmed CRM</h1>
          <p className="text-slate-500 text-sm mt-2">
            Ingresa tus credenciales para continuar
          </p>
        </div>

        {loginError && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"
          >
            {loginError}
          </div>
        )}

        <p className="text-sm mb-4">¿Olvidó su clave? Solicite un enlace de recuperación al administrador de Surmed.</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              {...register('email')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="nombre@surmed.com"
            />
            {errors.email && (
              <span className="text-red-500 text-xs mt-1">
                {errors.email.message}
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Contraseña
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="••••••••"
            />
            {errors.password && (
              <span className="text-red-500 text-xs mt-1">
                {errors.password.message}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-400"
          >
            {isSubmitting ? 'Iniciando sesión...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
