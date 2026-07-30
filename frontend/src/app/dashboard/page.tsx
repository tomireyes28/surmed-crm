'use client';

import { useEffect, useState } from 'react';
import { 
  dashboardService, 
  DashboardAppointment, 
  DashboardLowStock 
} from '@/services/dashboard.service';
import { 
  Users, TrendingUp, Calendar, AlertTriangle, 
  Plus, CheckCircle2, Clock, ArrowRight 
} from 'lucide-react';
import Link from 'next/link';
// NUEVO: Importamos el store de Zustand (Ajustá la ruta si tu archivo se llama distinto)
import { useAuthStore } from '@/store/authStore'; 

export default function DashboardPage() {
  // NUEVO: Obtenemos el usuario actual
  const user = useAuthStore((state) => state.user); 
  
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ totalPatients: 0, monthlyRevenue: 0 });
  const [appointments, setAppointments] = useState<DashboardAppointment[]>([]);
  const [lowStock, setLowStock] = useState<DashboardLowStock[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        const [kpisData, appointmentsData, stockData] = await Promise.all([
          dashboardService.getKpis(),
          dashboardService.getTodayAppointments(),
          dashboardService.getLowStock()
        ]);

        setStats(kpisData);
        setAppointments(appointmentsData);
        setLowStock(stockData);
      } catch (error) {
        console.error('Error cargando el dashboard:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
  };

  const todayFormatted = new Intl.DateTimeFormat('es-AR', { 
    weekday: 'long', day: 'numeric', month: 'long' 
  }).format(new Date());

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center text-slate-500">Cargando sala de control...</div>;
  }

  return (
    <div className="space-y-8">
      {/* HEADER Y ACCIONES RÁPIDAS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">¡Hola, Equipo! 👋</h1>
          <p className="text-slate-500 mt-1 capitalize">{todayFormatted}</p>
        </div>
        
        <div className="flex gap-3">
          <Link href="/dashboard/agenda" className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors flex items-center gap-2 border border-blue-200">
            <Calendar size={18} />
            Agendar Turno
          </Link>
          
          {/* BLOQUEO POR ROL: Solo ADMIN puede cobrar desde acá */}
          {user?.role === 'ADMIN' && (
            <Link href="/dashboard/invoices/new" className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm">
              <Plus size={18} />
              Cobrar
            </Link>
          )}
        </div>
      </div>

      {/* KPIs ROW (Tarjetas de métricas) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-blue-300 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-500 text-sm font-medium">Turnos de Hoy</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-1">{appointments.length}</h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
              <Calendar size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-purple-300 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-500 text-sm font-medium">Pacientes Activos</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-1">{stats.totalPatients}</h3>
            </div>
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl group-hover:scale-110 transition-transform">
              <Users size={24} />
            </div>
          </div>
        </div>

        {/* BLOQUEO POR ROL: Solo ADMIN ve la tarjeta de ingresos */}
        {user?.role === 'ADMIN' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-emerald-300 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500 text-sm font-medium">Ingresos del Mes</p>
                <h3 className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(stats.monthlyRevenue)}</h3>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
                <TrendingUp size={24} />
              </div>
            </div>
          </div>
        )}

        <div className={`p-6 rounded-2xl border shadow-sm flex flex-col justify-between transition-colors ${lowStock.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
          <div className="flex justify-between items-start">
            <div>
              <p className={`text-sm font-medium ${lowStock.length > 0 ? 'text-red-600' : 'text-slate-500'}`}>Alertas de Stock</p>
              <h3 className={`text-3xl font-bold mt-1 ${lowStock.length > 0 ? 'text-red-700' : 'text-slate-800'}`}>
                {lowStock.length}
              </h3>
            </div>
            <div className={`p-3 rounded-xl ${lowStock.length > 0 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-50 text-slate-400'}`}>
              <AlertTriangle size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* WIDGETS ROW (Agenda y Alertas) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* AGENDA DEL DÍA */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Clock className="text-blue-600" />
              Agenda del Día
            </h2>
            <Link href="/dashboard/agenda" className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1">
              Ver agenda completa <ArrowRight size={16} />
            </Link>
          </div>
          
          <div className="p-0 flex-1 overflow-auto">
            {appointments.length === 0 ? (
              <div className="h-full min-h-50 flex flex-col items-center justify-center text-slate-500 p-6">
                <CheckCircle2 size={48} className="text-emerald-400 mb-4 opacity-50" />
                <p className="font-medium text-lg">Agenda libre</p>
                <p className="text-sm">No hay turnos programados para el día de hoy.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {appointments.map((apt) => (
                  <li key={apt.id} className="p-4 sm:px-6 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 text-center">
                        <span className="block text-lg font-bold text-slate-800">
                          {new Date(apt.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{apt.patient.lastName}, {apt.patient.firstName}</p>
                        <p className="text-sm text-slate-500">Con {apt.doctor.name} • {apt.specialty.name}</p>
                      </div>
                    </div>
                    <div>
                      {apt.status === 'PENDING' && <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">Pendiente</span>}
                      {apt.status === 'CONFIRMED' && <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">Confirmado</span>}
                      {apt.status === 'IN_WAITING_ROOM' && <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-full animate-pulse">En Sala</span>}
                      {apt.status === 'ATTENDED' && <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">Atendido</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* INVENTARIO CRÍTICO */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className={lowStock.length > 0 ? "text-red-600" : "text-emerald-500"} />
              Atención Crítica
            </h2>
          </div>
          
          <div className="p-0 flex-1 overflow-auto">
            {lowStock.length === 0 ? (
              <div className="h-full min-h-50 flex flex-col items-center justify-center text-slate-500 p-6">
                <CheckCircle2 size={40} className="text-emerald-400 mb-3 opacity-50" />
                <p className="text-center font-medium">Inventario al día</p>
                <p className="text-center text-sm">No hay insumos por debajo del stock mínimo.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lowStock.slice(0, 5).map((item) => (
                  <li key={item.id} className="p-4 hover:bg-slate-50 transition-colors flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{item.name}</p>
                      <p className="text-xs text-slate-500">Mínimo: {item.minStock}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-red-600 text-lg">{item.quantity}</span>
                      <p className="text-[10px] uppercase font-bold text-red-400">Quedan</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            
            {lowStock.length > 0 && (
              <div className="p-4 border-t border-slate-100 bg-slate-50 text-center">
                <Link href="/dashboard/inventory" className="text-sm font-bold text-red-600 hover:text-red-800 flex justify-center items-center gap-1">
                  Ir al Inventario <ArrowRight size={16} />
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}