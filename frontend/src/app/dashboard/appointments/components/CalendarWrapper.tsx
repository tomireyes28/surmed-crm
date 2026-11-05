'use client';

import { useState } from 'react';
import {
  Calendar,
  dateFnsLocalizer,
  View,
  EventProps,
} from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale/es';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Appointment } from '../../../../schemas/appointment.schema';
import { appointmentService } from '@/services/appointment.service';
import { Save, Clock } from 'lucide-react';
import { AccessibleModal } from '@/components/ui/AccessibleModal';
import {
  APPOINTMENT_STATUS_META,
  AppointmentStatusType,
} from '@/utils/domain-rules';
import { isAxiosError } from 'axios';

const locales = { es };

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
      <span className="font-semibold text-xs leading-tight truncate drop-shadow-sm">
        {patient}
      </span>
      <span className="text-[10px] leading-tight truncate opacity-90">
        {specialty}
      </span>
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

export function CalendarWrapper({
  appointments,
  view,
  onViewChange,
  date,
  onDateChange,
  onAppointmentUpdated,
}: CalendarWrapperProps) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState<AppointmentStatusType>('PENDING');
  const [cancelReason, setCancelReason] = useState('');

  const events: CalendarEvent[] = appointments.map((app) => ({
    id: app.id,
    title: `${app.patient?.lastName}, ${app.patient?.firstName} - ${app.specialty?.name}`,
    start: new Date(app.date),
    end: new Date(new Date(app.date).getTime() + app.duration * 60000),
    resource: app,
  }));

  const eventStyleGetter = (event: CalendarEvent) => {
    const status = event.resource.status as AppointmentStatusType;
    const backgroundColor =
      APPOINTMENT_STATUS_META[status]?.calendarColor ?? '#3b82f6';

    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        color: '#ffffff',
        border: '1px solid rgba(255,255,255,0.2)',
        display: 'block',
      },
    };
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setNewStatus(event.resource.status as AppointmentStatusType);
    setCancelReason('');
  };

  const handleStatusUpdate = async () => {
    if (!selectedEvent || newStatus === selectedEvent.resource.status) {
      setSelectedEvent(null);
      return;
    }

    setIsUpdating(true);
    try {
      await appointmentService.updateStatus(
        selectedEvent.resource.id,
        newStatus,
        newStatus === 'CANCELLED' ? cancelReason.trim() || undefined : undefined,
      );
      onAppointmentUpdated();
      setSelectedEvent(null);
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      const msg = isAxiosError(error)
        ? error.response?.data?.message
        : 'No se pudo actualizar el estado del turno.';
      alert(msg || 'No se pudo actualizar el estado del turno.');
    } finally {
      setIsUpdating(false);
    }
  };

  const currentStatus = (selectedEvent?.resource.status ??
    'PENDING') as AppointmentStatusType;
  const allowedNext =
    APPOINTMENT_STATUS_META[currentStatus]?.allowedNext ?? [];
  const selectableStatuses: AppointmentStatusType[] = [
    currentStatus,
    ...allowedNext,
  ];
  const isTerminalStatus = allowedNext.length === 0;

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
          event: CustomEvent,
        }}
        messages={{
          next: 'Siguiente',
          previous: 'Anterior',
          today: 'Hoy',
          month: 'Mes',
          week: 'Semana',
          day: 'Día',
          agenda: 'Agenda',
          noEventsInRange: 'No hay turnos agendados en este rango.',
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

      <AccessibleModal
        isOpen={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title="Gestión del Turno"
        titleId="appointment-status-modal-title"
        isDirty={
          Boolean(selectedEvent) &&
          newStatus !== selectedEvent?.resource.status
        }
        maxWidthClass="max-w-sm"
        headerClassName="bg-slate-50"
        headerIcon={<Clock size={18} className="text-blue-600" />}
      >
        {selectedEvent && (
          <>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm text-slate-500 mb-1">Paciente</p>
                <p className="font-medium text-slate-900">
                  {selectedEvent.title}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {format(selectedEvent.start, 'dd/MM/yyyy HH:mm', {
                    locale: es,
                  })}{' '}
                  hs
                </p>
              </div>

              <div>
                <label
                  htmlFor="appointment-status-select"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Estado del Turno
                </label>
                <select
                  id="appointment-status-select"
                  value={newStatus}
                  disabled={isTerminalStatus || isUpdating}
                  onChange={(e) =>
                    setNewStatus(e.target.value as AppointmentStatusType)
                  }
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm disabled:bg-slate-100"
                >
                  {selectableStatuses.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>
                      {APPOINTMENT_STATUS_META[statusOption]?.label ??
                        statusOption}
                    </option>
                  ))}
                </select>
                {isTerminalStatus && (
                  <p className="text-xs text-slate-500 mt-1">
                    Este turno ya se encuentra en un estado final (
                    {APPOINTMENT_STATUS_META[currentStatus]?.label}).
                  </p>
                )}
              </div>

              {newStatus === 'CANCELLED' && currentStatus !== 'CANCELLED' && (
                <div>
                  <label
                    htmlFor="appointment-cancel-reason"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Motivo de cancelación (opcional)
                  </label>
                  <input
                    id="appointment-cancel-reason"
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Ej: Reprogramado a pedido del paciente"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cerrar
              </button>
              {!isTerminalStatus && (
                <button
                  type="button"
                  onClick={() => void handleStatusUpdate()}
                  disabled={
                    isUpdating || newStatus === selectedEvent.resource.status
                  }
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-60"
                >
                  <Save size={16} />
                  {isUpdating ? 'Actualizando...' : 'Guardar Cambios'}
                </button>
              )}
            </div>
          </>
        )}
      </AccessibleModal>
    </div>
  );
}
