'use client';

import { useState, useEffect, useCallback } from 'react';
import { View } from 'react-big-calendar';
import { Plus, Calendar as CalendarIcon } from 'lucide-react';
import { CalendarWrapper } from './components/CalendarWrapper';
import { Appointment } from '@/schemas/appointment.schema';
import { appointmentService } from '@/services/appointment.service';

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [view, setView] = useState<View>('week');
  const [date, setDate] = useState(new Date());

  const fetchAppointments = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await appointmentService.getAppointments();
      setAppointments(data);
    } catch (error) {
      console.error('Error cargando turnos:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // EL FIX 2: Envolvemos la llamada en una función asíncrona interna
  useEffect(() => {
    const load = async () => {
      await fetchAppointments();
    };
    load();
  }, [fetchAppointments]);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
            <CalendarIcon size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Agenda Médica</h1>
        </div>
        <button 
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
          onClick={() => alert('Próximamente: Modal de Nuevo Turno')}
        >
          <Plus size={20} />
          <span className="hidden sm:inline">Nuevo Turno</span>
        </button>
      </div>

      <div className="flex-1 bg-white p-4 rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            Cargando agenda...
          </div>
        ) : (
          <CalendarWrapper 
            appointments={appointments}
            view={view}
            onViewChange={setView}
            date={date}
            onDateChange={setDate}
          />
        )}
      </div>
    </div>
  );
}