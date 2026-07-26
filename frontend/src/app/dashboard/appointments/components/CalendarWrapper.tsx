'use client';

import { useState } from 'react';
import { Calendar, dateFnsLocalizer, View, EventProps} from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale/es';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Appointment } from '../../../../schemas/appointment.schema';
import { appointmentService } from '@/services/appointment.service';
import { X, Save, Clock } from 'lucide-react';

const locales = { 'es': es };

// Interfaz para el evento que espera react-big-calendar
interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Appointment;
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const CustomEvent = ({ event }: EventProps<CalendarEvent>) => {
  const title = (event.title as string) || ''; 
  const [patient, specialty] = title.split(' - ');
  
  return (
    <div className="flex flex-col justify-start h-full overflow-hidden p-0.5">
      <span className="font-semibold text-xs leading-tight truncate drop-shadow-sm">{patient}</span>
      <span className="text-[10px] leading-tight truncate opacity-90">{specialty}</span>
    </div>
  );
};

interface CalendarWrapperProps {
  appointments: Appointment[];
  view: View;
  onViewChange: (view: View) => void;
  date: Date;
  onDateChange: (date: Date) => void;
  onAppointmentUpdated: () => void;
}

export function CalendarWrapper({ appointments, view, onViewChange, date, onDateChange, onAppointmentUpdated }: CalendarWrapperProps) {
  // Ahora el estado sabe que espera un CalendarEvent o null
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');

  const events: CalendarEvent[] = appointments.map(app => ({
    id: app.id,
    title: `${app.patient?.lastName}, ${app.patient?.firstName} - ${app.specialty?.name}`,
    start: new Date(app.date),
    end: new Date(new Date(app.date).getTime() + app.duration * 60000),
    resource: app,
  }));

  const eventStyleGetter = (event: CalendarEvent) => {
    const status = event.resource.status;
    let backgroundColor = '#3b82f6'; // PENDING -> blue-500
    
    if (status === 'CONFIRMED') backgroundColor = '#10b981'; // emerald-500
    if (status === 'IN_WAITING_ROOM') backgroundColor = '#f59e0b'; // amber-500
    if (status === 'ATTENDED') backgroundColor = '#8b5cf6'; // purple-500 
    if (status === 'CANCELLED') backgroundColor = '#ef4444'; // red-500

    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        color: '#ffffff',
        border: '1px solid rgba(255,255,255,0.2)',
        display: 'block',
      }
    };
  };

  // Usamos el tipo CalendarEvent en el handler
  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setNewStatus(event.resource.status);
  };

  const handleStatusUpdate = async () => {
    if (!selectedEvent || newStatus === selectedEvent.resource.status) {
      setSelectedEvent(null);
      return;
    }

    setIsUpdating(true);
    try {
      await appointmentService.updateStatus(selectedEvent.resource.id, newStatus);
      onAppointmentUpdated(); 
      setSelectedEvent(null);
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      alert('No se pudo actualizar el estado del turno.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="h-full relative">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: '100%' }}
        culture="es"
        components={{
          event: CustomEvent
         }}
        messages={{
          next: "Siguiente",
          previous: "Anterior",
          today: "Hoy",
          month: "Mes",
          week: "Semana",
          day: "Día",
          agenda: "Agenda",
          noEventsInRange: "No hay turnos agendados en este rango.",
        }}
        view={view}
        onView={onViewChange}
        date={date}
        onNavigate={onDateChange}
        eventPropGetter={eventStyleGetter}
        onSelectEvent={handleSelectEvent}
        step={15}
        timeslots={2}
        min={new Date(0, 0, 0, 8, 0, 0)} 
        max={new Date(0, 0, 0, 20, 0, 0)} 
      />

      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Clock size={18} className="text-blue-600" />
                Gestión del Turno
              </h3>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm text-slate-500 mb-1">Paciente</p>
                <p className="font-medium text-slate-900">{selectedEvent.title}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {format(selectedEvent.start, "dd/MM/yyyy HH:mm", { locale: es })} hs
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Estado Actual</label>
                <select 
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
                >
                  <option value="PENDING">Pendiente (Azul)</option>
                  <option value="CONFIRMED">Confirmado (Verde)</option>
                  <option value="IN_WAITING_ROOM">En Sala de Espera (Naranja)</option>
                  <option value="ATTENDED">Atendido (Púrpura)</option>
                  <option value="CANCELLED">Cancelado (Rojo)</option>
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button 
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cerrar
              </button>
              <button 
                onClick={handleStatusUpdate}
                disabled={isUpdating}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-70"
              >
                {isUpdating ? 'Actualizando...' : <><Save size={16} /> Guardar Cambios</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}