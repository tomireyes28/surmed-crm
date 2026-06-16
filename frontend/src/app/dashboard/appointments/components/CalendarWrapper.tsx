import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale/es';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Appointment } from '../../../../schemas/appointment.schema';

const locales = {
  'es': es,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

interface CalendarWrapperProps {
  appointments: Appointment[];
  view: View;
  onViewChange: (view: View) => void;
  date: Date;
  onDateChange: (date: Date) => void;
}

export function CalendarWrapper({ appointments, view, onViewChange, date, onDateChange }: CalendarWrapperProps) {
  const events = appointments.map(app => ({
    id: app.id,
    title: `${app.patient?.lastName}, ${app.patient?.firstName} - ${app.specialty?.name}`,
    start: new Date(app.date),
    end: new Date(new Date(app.date).getTime() + app.duration * 60000),
    resource: app,
  }));

  // EL FIX: Reemplazamos 'any' por la estructura exacta que le pasamos en 'events'
  const eventStyleGetter = (event: { resource: Appointment }) => {
    const status = event.resource.status;
    let backgroundColor = '#3b82f6'; 
    
    if (status === 'CONFIRMED') backgroundColor = '#10b981'; 
    if (status === 'IN_WAITING_ROOM') backgroundColor = '#f59e0b'; 
    if (status === 'CANCELLED') backgroundColor = '#ef4444'; 

    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        color: 'white',
        border: 'none',
        display: 'block',
        fontSize: '0.875rem',
        padding: '2px 4px'
      }
    };
  };

  return (
    <Calendar
      localizer={localizer}
      events={events}
      startAccessor="start"
      endAccessor="end"
      style={{ height: '100%' }}
      culture="es"
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
      onSelectEvent={(event) => console.log('Turno seleccionado:', event.resource)}
      step={15}
      timeslots={2}
      min={new Date(0, 0, 0, 8, 0, 0)} 
      max={new Date(0, 0, 0, 20, 0, 0)} 
    />
  );
}