import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale/es';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Appointment } from '../../../../schemas/appointment.schema';

const locales = { 'es': es };

interface CustomEventProps {
  event: {
    title: string;
  };
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

// 1. CREAMOS EL COMPONENTE PERSONALIZADO PARA EL BLOQUE DEL TURNO
const CustomEvent = ({ event }: CustomEventProps) => {
  // Separamos el título (Paciente - Especialidad)
  const [patient, specialty] = event.title.split(' - ');
  
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
}

export function CalendarWrapper({ appointments, view, onViewChange, date, onDateChange }: CalendarWrapperProps) {
  const events = appointments.map(app => ({
    id: app.id,
    title: `${app.patient?.lastName}, ${app.patient?.firstName} - ${app.specialty?.name}`,
    start: new Date(app.date),
    end: new Date(new Date(app.date).getTime() + app.duration * 60000),
    resource: app,
  }));

  const eventStyleGetter = (event: { resource: Appointment }) => {
    const status = event.resource.status;
    let backgroundColor = '#3b82f6'; // PENDING -> blue-500
    
    if (status === 'CONFIRMED') backgroundColor = '#10b981'; // CONFIRMED -> emerald-500
    if (status === 'IN_WAITING_ROOM') backgroundColor = '#f59e0b'; // amber-500
    if (status === 'CANCELLED') backgroundColor = '#ef4444'; // red-500

    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        color: '#ffffff',
        border: '1px solid rgba(255,255,255,0.2)', // Borde sutil para darle profundidad
        display: 'block',
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
      // 2. LE INYECTAMOS NUESTRO DISEÑO A LA LIBRERÍA
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
      step={15}
      timeslots={2}
      min={new Date(0, 0, 0, 8, 0, 0)} 
      max={new Date(0, 0, 0, 20, 0, 0)} 
    />
  );
}