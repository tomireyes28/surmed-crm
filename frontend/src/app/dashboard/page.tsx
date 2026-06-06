'use client';

import { useAuthStore } from '@/store/authStore';
import Cookies from 'js-cookie';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const logoutStore = useAuthStore((state) => state.logout);
  const router = useRouter();

  const handleLogout = () => {
    Cookies.remove('token'); // Borramos la cookie
    logoutStore(); // Limpiamos Zustand
    router.push('/'); // Volvemos al login
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm p-6 border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Panel de Control</h1>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
        
        <p className="text-slate-600">
          Bienvenido al CRM, <span className="font-semibold text-blue-600">{user?.name || 'Cargando...'}</span>.
        </p>
        <p className="text-sm text-slate-400 mt-2">Tu rol en el sistema es: {user?.role}</p>
      </div>
    </div>
  );
}