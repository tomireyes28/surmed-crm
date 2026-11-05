import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Save, Loader2, Search } from 'lucide-react';

import {
  createAppointmentSchema,
  CreateAppointmentFormValues,
} from '../../../../schemas/appointment.schema';
import { appointmentService } from '../../../../services/appointment.service';
import { patientsService } from '../../../../services/patients.service';
import {
  specialtiesService,
  Specialty,
} from '../../../../services/specialties.service';
import { usersService, UserDoctor } from '../../../../services/users.service';
import { Patient } from '../../../../schemas/patient.schema';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedPatientId?: string;
}

export function NewAppointmentModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedPatientId,
}: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [preselectedPatient, setPreselectedPatient] = useState<Patient | null>(
    null,
  );
  const [patientSearch, setPatientSearch] = useState('');
  const [patientPage, setPatientPage] = useState(1);
  const [patientTotalPages, setPatientTotalPages] = useState(1);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);

  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctors, setDoctors] = useState<UserDoctor[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
  } = useForm<CreateAppointmentFormValues>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: {
      duration: 30,
      patientId: preselectedPatientId || '',
    },
  });

  useEffect(() => {
    if (preselectedPatientId) {
      setValue('patientId', preselectedPatientId);
    }
  }, [preselectedPatientId, setValue]);

  const fetchPatientsPage = useCallback(
    async (page: number, search: string) => {
      setIsSearchingPatients(true);
      try {
        const res = await patientsService.getAll(page, 10, search);
        setPatients(res.data);
        setPatientTotalPages(Math.max(1, res.meta.totalPages));
      } catch (error) {
        console.error('Error buscando pacientes:', error);
      } finally {
        setIsSearchingPatients(false);
      }
    },
    [],
  );

  // Carga inicial cuando se abre el modal (incluyendo preselección fuera de la primera página)
  useEffect(() => {
    if (!isOpen) return;

    const loadInitialData = async () => {
      setIsLoadingData(true);
      try {
        const [patientsRes, specialtiesData, doctorsData, preselectedData] =
          await Promise.all([
            patientsService.getAll(1, 10),
            specialtiesService.getAll(),
            usersService.getDoctors(),
            preselectedPatientId
              ? patientsService
                  .getById(preselectedPatientId)
                  .catch(() => null)
              : Promise.resolve(null),
          ]);

        setPatients(patientsRes.data);
        setPatientPage(1);
        setPatientTotalPages(Math.max(1, patientsRes.meta.totalPages));
        setSpecialties(specialtiesData);
        setDoctors(doctorsData);
        setPreselectedPatient(preselectedData);

        if (preselectedPatientId) {
          setValue('patientId', preselectedPatientId);
        }
      } catch (error) {
        console.error('Error cargando datos para el formulario:', error);
      } finally {
        setIsLoadingData(false);
      }
    };

    void loadInitialData();
  }, [isOpen, preselectedPatientId, setValue]);

  // Búsqueda con debounce del lado servidor
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      void fetchPatientsPage(patientPage, patientSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [isOpen, patientPage, patientSearch, fetchPatientsPage]);

  if (!isOpen) return null;

  // Garantizamos que el paciente preseleccionado esté siempre en las opciones del select aunque no pertenezca a la página actual (F02 / T04)
  const availablePatients: Patient[] =
    preselectedPatient &&
    !patients.some((p) => p.id === preselectedPatient.id)
      ? [preselectedPatient, ...patients]
      : patients;

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
          <h2 className="text-xl font-bold text-slate-800">
            Agendar Nuevo Turno
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Cerrar modal"
          >
            <X size={24} />
          </button>
        </div>

        {isLoadingData ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-500">
            <Loader2 className="animate-spin mb-2" size={32} />
            <p>Cargando datos...</p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="p-6 space-y-4 overflow-y-auto"
          >
            {/* Paciente con buscador paginado en servidor */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Paciente *
              </label>

              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    setPatientPage(1);
                  }}
                  placeholder="Buscar por apellido, nombre o documento..."
                  className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <select
                {...register('patientId')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                disabled={isSearchingPatients}
              >
                <option value="">
                  {isSearchingPatients
                    ? 'Buscando pacientes...'
                    : 'Seleccione un paciente'}
                </option>
                {availablePatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lastName}, {p.firstName} - Doc: {p.documentId}
                  </option>
                ))}
              </select>

              {patientTotalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>
                    Página {patientPage} de {patientTotalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={patientPage <= 1 || isSearchingPatients}
                      onClick={() =>
                        setPatientPage((prev) => Math.max(1, prev - 1))
                      }
                      className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      disabled={
                        patientPage >= patientTotalPages || isSearchingPatients
                      }
                      onClick={() =>
                        setPatientPage((prev) =>
                          Math.min(patientTotalPages, prev + 1),
                        )
                      }
                      className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}

              {errors.patientId && (
                <span className="text-red-500 text-xs mt-1 block">
                  {errors.patientId.message}
                </span>
              )}
            </div>

            {/* Especialidad */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Especialidad *
              </label>
              <select
                {...register('specialtyId')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Seleccione una especialidad</option>
                {specialties.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {errors.specialtyId && (
                <span className="text-red-500 text-xs mt-1">
                  {errors.specialtyId.message}
                </span>
              )}
            </div>

            {/* Médico */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Médico *
              </label>
              <select
                {...register('doctorId')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Seleccione un médico</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    Dr/a. {d.name}
                  </option>
                ))}
              </select>
              {errors.doctorId && (
                <span className="text-red-500 text-xs mt-1">
                  {errors.doctorId.message}
                </span>
              )}
            </div>

            {/* Fecha, Hora y Duración (en Grid) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Fecha y Hora *
                </label>
                <input
                  type="datetime-local"
                  {...register('date')}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {errors.date && (
                  <span className="text-red-500 text-xs mt-1">
                    {errors.date.message}
                  </span>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Duración (minutos)
                </label>
                <input
                  type="number"
                  step="15"
                  min="15"
                  {...register('duration', { valueAsNumber: true })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {errors.duration && (
                  <span className="text-red-500 text-xs mt-1">
                    {errors.duration.message}
                  </span>
                )}
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Motivo / Notas
              </label>
              <input
                type="text"
                placeholder="Ej: Control de rutina"
                {...register('notes')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Botonera */}
            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:bg-emerald-400 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Save size={18} />
                )}
                {isSubmitting ? 'Guardando...' : 'Agendar Turno'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
