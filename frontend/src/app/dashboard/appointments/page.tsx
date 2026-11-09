'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { View } from 'react-big-calendar';
import { Plus, Calendar as CalendarIcon } from 'lucide-react';
import { CalendarWrapper } from './components/CalendarWrapper';
import { Appointment } from '@/schemas/appointment.schema';
import { appointmentService } from '@/services/appointment.service';
import { NewAppointmentModal } from './components/NewAppointmentModal';
import { ErrorAlert } from '@/components/ui/PageState';
import { getCalendarRange, toClinicCalendarDate } from '@/utils/calendar';

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [view, setView] = useState<View>('week');
  const [date, setDate] = useState(() => toClinicCalendarDate(new Date()));
  const requestVersion = useRef(0);
  const { from, to } = getCalendarRange(date, view);

  const fetchAppointments = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      setIsLoading(true);
      setLoadError(null);
      const data = await appointmentService.getAppointments({ from, to });
      if (version !== requestVersion.current) return;
      setAppointments(data);
    } catch (error) {
      if (version !== requestVersion.current) return;
      setAppointments([]);
      console.error('Error cargando turnos:', error);
      setLoadError(
        'No se pudo cargar la agenda médica. Verifique la conexión con el servidor.',
      );
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    const load = async () => {
      await fetchAppointments();
    };
    void load();
  }, [fetchAppointments]);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4">
      <NewAppointmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchAppointments}
      />

      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
            <CalendarIcon size={24} />
          </div>
          <div><h1 className="text-2xl font-bold text-slate-800">Agenda Médica</h1><p className="text-xs text-slate-500">Horario de Surmed · Paraguay (UTC−03:00)</p></div>
        </div>
        <button
          type="button"
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={20} />
          <span className="hidden sm:inline">Nuevo Turno</span>
        </button>
      </div>

      {loadError && (
        <ErrorAlert
          message={loadError}
          onRetry={() => void fetchAppointments()}
        />
      )}

      <div className="flex flex-wrap items-center gap-4 px-2 text-sm text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />{' '}
          Pendiente
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />{' '}
          Confirmado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> En
          Espera
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" />{' '}
          Atendido
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />{' '}
          Cancelado
        </span>
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
            onAppointmentUpdated={fetchAppointments}
          />
        )}
      </div>
    </div>
  );
}
