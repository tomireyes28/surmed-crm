'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import Cookies from 'js-cookie';
import { Users, Package, FileText, LogOut, Activity, Menu, Calendar, Shield } from 'lucide-react'; 
import { useState, useEffect } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logoutStore = useAuthStore((state) => state.logout);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
    }, 0);
    
    return () => clearTimeout(timer);
  }, []);

  const handleLogout = () => {
    Cookies.remove('token');
    logoutStore();
    router.push('/');
  };

  // ACÁ ESTÁ LA MAGIA DEL DÍA 4: Definimos exactamente quién ve qué.
  // Recepción ahora puede ver Inventario (para avisar si falta algo) y Facturación (para cobrar)
  const menuItems = [
    { name: 'Dashboard', href: '/dashboard', icon: Activity, allowedRoles: ['ADMIN', 'MEDICO', 'RECEPCION'] },
    { name: 'Agenda', href: '/dashboard/appointments', icon: Calendar, allowedRoles: ['ADMIN', 'MEDICO', 'RECEPCION'] },
    { name: 'Pacientes', href: '/dashboard/patients', icon: Users, allowedRoles: ['ADMIN', 'MEDICO', 'RECEPCION'] },
    { name: 'Staff', href: '/dashboard/staff', icon: Shield, allowedRoles: ['ADMIN'] }, 
    { name: 'Inventario', href: '/dashboard/inventory', icon: Package, allowedRoles: ['ADMIN', 'RECEPCION'] },
    { name: 'Facturación', href: '/dashboard/invoices', icon: FileText, allowedRoles: ['ADMIN', 'RECEPCION'] },
  ];

  const visibleMenuItems = menuItems.filter(item => 
    user && item.allowedRoles.includes(user.role)
  );

  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`bg-slate-900 text-white transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-20'} flex flex-col`}>
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
          <h2 className={`font-bold text-xl text-emerald-500 transition-all ${isSidebarOpen && 'hidden'}`}>
            S
          </h2>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-2 px-3">
          {visibleMenuItems.map((item) => {
            const isActive = item.href === '/dashboard' 
              ? pathname === '/dashboard' 
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
              
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={20} className="shrink-0" />
                <span className={`${!isSidebarOpen && 'hidden'} whitespace-nowrap`}>
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
          >
            <Menu size={24} />
          </button>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-700">{user?.name || 'Usuario'}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.role.toLowerCase()}</p>
            </div>
            <div className="h-8 w-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <button 
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-500 transition-colors ml-2"
              title="Cerrar Sesión"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}