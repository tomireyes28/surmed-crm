'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/services/api';
import {
  Users,
  Package,
  FileText,
  LogOut,
  Activity,
  Menu,
  Calendar,
  Shield,
  Stethoscope,
  KeyRound,
  X,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { isAxiosError } from 'axios';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logoutStore = useAuthStore((state) => state.logout);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleLogout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
      logoutStore();
      router.replace('/');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        logoutStore(); router.replace('/'); return;
      }
      alert('No se pudo confirmar el cierre de sesión. Reintente antes de dejar el equipo.');
    }
  }, [logoutStore, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
    }, 0);

    // Validamos la sesión real con el backend al montar el layout protegido
    api
      .get('/auth/me')
      .then((res) => {
        if (res.data) {
          setUser({
            id: res.data.id,
            name: res.data.name,
            email: res.data.email,
            role: res.data.role,
          });
          setSessionReady(true);
        }
      })
      .catch((error) => {
        if (isAxiosError(error) && error.response?.status === 401) {
          logoutStore();
          router.replace('/');
        } else {
          setSessionError(true);
        }
      });

    return () => clearTimeout(timer);
  }, [logoutStore, router, setUser]);

  // Cierre automático por inactividad en equipos compartidos (S06 / T03)
  useEffect(() => {
    if (!isMounted) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        void handleLogout();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [isMounted, handleLogout]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);

    if (newPassword.length < 8) {
      setPasswordFeedback({
        type: 'error',
        text: 'La nueva contraseña debe tener al menos 8 caracteres.',
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      await api.patch('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setPasswordFeedback({
        type: 'success',
        text: 'Contraseña actualizada. Inicie sesión con su nueva clave.',
      });
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        logoutStore();
        router.replace('/');
      }, 1200);
    } catch (error) {
      const msg = isAxiosError(error)
        ? error.response?.data?.message
        : 'No se pudo cambiar la contraseña.';
      setPasswordFeedback({
        type: 'error',
        text: Array.isArray(msg) ? msg.join(', ') : msg || 'Error al actualizar la contraseña.',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const menuItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: Activity,
      allowedRoles: ['ADMIN', 'MEDICO', 'RECEPCION'],
    },
    {
      name: 'Agenda',
      href: '/dashboard/appointments',
      icon: Calendar,
      allowedRoles: ['ADMIN', 'MEDICO', 'RECEPCION'],
    },
    {
      name: 'Pacientes',
      href: '/dashboard/patients',
      icon: Users,
      allowedRoles: ['ADMIN', 'MEDICO', 'RECEPCION'],
    },
    {
      name: 'Staff',
      href: '/dashboard/staff',
      icon: Shield,
      allowedRoles: ['ADMIN'],
    },
    {
      name: 'Inventario',
      href: '/dashboard/inventory',
      icon: Package,
      allowedRoles: ['ADMIN', 'RECEPCION'],
    },
    {
      name: 'Facturación',
      href: '/dashboard/invoices',
      icon: FileText,
      allowedRoles: ['ADMIN', 'RECEPCION'],
    },
    {
      name: 'Especialidades',
      href: '/dashboard/specialties',
      icon: Stethoscope,
      allowedRoles: ['ADMIN'],
    },
  ];

  const visibleMenuItems = menuItems.filter(
    (item) => user && item.allowedRoles.includes(user.role),
  );

  if (!isMounted) return null;
  if (sessionError) return <main className="max-w-md mx-auto my-16 p-6 space-y-4" role="alert"><p>No se pudo verificar la sesión. Compruebe la conexión y reintente.</p><button className="border rounded p-2" onClick={() => window.location.reload()}>Reintentar</button></main>;
  if (!sessionReady) return <p role="status" className="p-6">Verificando sesión…</p>;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className={`bg-slate-900 text-white transition-all duration-300 ${
          isSidebarOpen ? 'w-64' : 'w-20'
        } flex flex-col`}
      >
        <div className="h-20 flex items-center justify-center border-b border-slate-800 py-3">
          <div className={`${!isSidebarOpen ? 'hidden' : 'block'}`}>
            <Image
              src="/logo.png"
              alt="Surmed Logo"
              width={140}
              height={50}
              className="object-contain"
              priority
            />
          </div>
          <h2
            className={`font-bold text-xl text-emerald-500 transition-all ${
              isSidebarOpen && 'hidden'
            }`}
          >
            S
          </h2>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-2 px-3">
          {visibleMenuItems.map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={20} className="shrink-0" />
                <span
                  className={`${!isSidebarOpen && 'hidden'} whitespace-nowrap`}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <button
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="text-slate-500 hover:text-slate-700 transition-colors"
            aria-label="Alternar menú lateral"
          >
            <Menu size={24} />
          </button>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-700">
                {user?.name || 'Usuario'}
              </p>
              <p className="text-xs text-slate-500 capitalize">
                {user?.role.toLowerCase()}
              </p>
            </div>
            <div className="h-8 w-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <button
              onClick={() => {
                setCurrentPassword('');
                setNewPassword('');
                setPasswordFeedback(null);
                setIsPasswordModalOpen(true);
              }}
              className="text-slate-400 hover:text-blue-600 transition-colors"
              title="Cambiar Contraseña"
              aria-label="Cambiar Contraseña"
            >
              <KeyRound size={20} />
            </button>
            <button
              onClick={() => void handleLogout()}
              className="text-slate-400 hover:text-red-500 transition-colors"
              title="Cerrar Sesión"
              aria-label="Cerrar Sesión"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>

      {/* Modal de cambio de contraseña */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <KeyRound size={20} className="text-blue-600" />
                Cambiar Contraseña
              </h3>
              <button
                onClick={() => setIsPasswordModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Cerrar ventana"
              >
                <X size={20} />
              </button>
            </div>

            {passwordFeedback && (
              <div
                className={`mb-4 p-3 rounded-lg text-sm ${
                  passwordFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {passwordFeedback.text}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Contraseña actual
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nueva contraseña (mín. 8 caracteres)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  maxLength={72}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:bg-blue-400"
                >
                  {isChangingPassword ? 'Actualizando...' : 'Actualizar Clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
