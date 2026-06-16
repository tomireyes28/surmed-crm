import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Save, Loader2 } from 'lucide-react';

// Importamos de forma segura con rutas relativas
import { createAppointmentSchema, CreateAppointmentFormValues } from '../../../../schemas/appointment.schema';
import { appointmentService } from '../../../../services/appointment.service';
import { patientsService } from '../../../../services/patients.service';
import { specialtiesService, Specialty } from '../../../../services/specialties.service';
import { usersService, UserDoctor } from '../../../../services/users.service';
import { Patient } from '../../../../schemas/patient.schema';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewAppointmentModal({ isOpen, onClose, onSuccess }: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctors, setDoctors] = useState<UserDoctor[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<CreateAppointmentFormValues>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: {
      duration: 30, // 30 minutos por defecto
    }
  });

  // Cargar datos de los selects cuando se abre el modal
  useEffect(() => {
    if (!isOpen) return;
    
    const loadData = async () => {
      setIsLoadingData(true);
      try {
        // Ejecutamos las 3 llamadas en paralelo para que sea súper rápido
        const [patientsData, specialtiesData, doctorsData] = await Promise.all([
          patientsService.getAll(),
          specialtiesService.getAll(),
          usersService.getDoctors()
        ]);
        
        setPatients(patientsData);
        setSpecialties(specialtiesData);
        setDoctors(doctorsData);
      } catch (error) {
        console.error('Error cargando datos para el formulario:', error);
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
  }, [isOpen]);

  if (!isOpen) return null;

  const onSubmit = async (data: CreateAppointmentFormValues) => {
    try {
      await appointmentService.createAppointment(data);
      reset(); 
      onSuccess(); 
      onClose(); 
    } catch (error) {
      console.error('Error al agendar turno:', error);
      alert('Hubo un error al guardar el turno');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800">Agendar Nuevo Turno</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        {isLoadingData ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-500">
            <Loader2 className="animate-spin mb-2" size={32} />
            <p>Cargando datos...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4 overflow-y-auto">
            {/* Paciente */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Paciente *</label>
              <select {...register('patientId')} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">Seleccione un paciente</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.lastName}, {p.firstName} - DNI: {p.documentId}</option>
                ))}
              </select>
              {errors.patientId && <span className="text-red-500 text-xs mt-1">{errors.patientId.message}</span>}
            </div>

            {/* Especialidad */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Especialidad *</label>
              <select {...register('specialtyId')} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">Seleccione una especialidad</option>
                {specialties.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {errors.specialtyId && <span className="text-red-500 text-xs mt-1">{errors.specialtyId.message}</span>}
            </div>

            {/* Médico */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Médico *</label>
              <select {...register('doctorId')} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">Seleccione un médico</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>Dr/a. {d.name}</option>
                ))}
              </select>
              {errors.doctorId && <span className="text-red-500 text-xs mt-1">{errors.doctorId.message}</span>}
            </div>

            {/* Fecha, Hora y Duración (en Grid) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha y Hora *</label>
                {/* Input nativo de HTML para fecha y hora (perfecto para enviar ISO strings) */}
                <input type="datetime-local" {...register('date')} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                {errors.date && <span className="text-red-500 text-xs mt-1">{errors.date.message}</span>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Duración (minutos)</label>
                <input type="number" step="15" min="15" {...register('duration', { valueAsNumber: true })} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                {errors.duration && <span className="text-red-500 text-xs mt-1">{errors.duration.message}</span>}
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Motivo / Notas</label>
              <input type="text" placeholder="Ej: Control de rutina" {...register('notes')} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>

            {/* Botonera */}
            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
              <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:bg-emerald-400 flex items-center gap-2">
                {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                {isSubmitting ? 'Guardando...' : 'Agendar Turno'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}