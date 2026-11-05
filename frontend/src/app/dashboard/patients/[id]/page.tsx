'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { patientsService } from '@/services/patients.service';
import { medicalRecordsService } from '@/services/medicalRecords.service';
import { Patient } from '@/schemas/patient.schema';
import Link from 'next/link';
import {
  ArrowLeft,
  Stethoscope,
  Clock,
  Send,
  Paperclip,
  FileText as FileIcon,
  CalendarPlus,
  CalendarDays,
  History,
  Lock,
  AlertTriangle,
  RefreshCw,
  MessageSquarePlus,
} from 'lucide-react';
import { NewAppointmentModal } from '../../appointments/components/NewAppointmentModal';
import { useAuthStore } from '@/store/authStore';
import { isAxiosError } from 'axios';
import {
  calculateCivilAge,
  formatClinicDate,
  formatClinicTime,
} from '@/utils/format';
import {
  APPOINTMENT_STATUS_META,
  AppointmentStatusType,
} from '@/utils/domain-rules';

interface MedicalRecord {
  id: string;
  notes: string;
  attachments: string[];
  parentRecordId?: string | null;
  missingAttachmentsCount?: number;
  createdAt: string;
  doctor: {
    name: string;
    email: string;
  };
}

interface EmbeddedAppointment {
  id: string;
  date: string;
  status: string;
  doctor: { name: string };
  specialty: { name: string };
}

interface PatientWithAppointments extends Patient {
  appointments?: EmbeddedAppointment[];
}

export default function PatientDetailPage() {
  const params = useParams();
  const patientId = params.id as string;

  const user = useAuthStore((state) => state.user);
  const canReadClinicalHistory =
    user?.role === 'MEDICO' || user?.role === 'ADMIN';
  const canCreateClinicalEvolution = user?.role === 'MEDICO';

  const [patient, setPatient] = useState<PatientWithAppointments | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newNote, setNewNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [activeAddendumRecordId, setActiveAddendumRecordId] = useState<
    string | null
  >(null);
  const [addendumText, setAddendumText] = useState('');
  const [isSubmittingAddendum, setIsSubmittingAddendum] = useState(false);

  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const patientData = await patientsService.getById(patientId);
      setPatient(patientData);

      // No solicitar datos clínicos desde una sesión sin permiso (S03 / T02)
      if (canReadClinicalHistory) {
        const recordsData = await medicalRecordsService.getByPatientId(patientId);
        setRecords(recordsData);
      } else {
        setRecords([]);
      }
    } catch (error) {
      console.error('Error cargando el historial:', error);
      if (isAxiosError(error)) {
        if (error.response?.status === 404) {
          setLoadError('El paciente solicitado no existe o fue archivado.');
        } else {
          setLoadError(
            error.response?.data?.message ||
              'No se pudo conectar con el servidor para cargar la ficha del paciente.',
          );
        }
      } else {
        setLoadError('Ocurrió un error inesperado al cargar los datos.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [patientId, canReadClinicalHistory]);

  useEffect(() => {
    if (!user) return;
    const fetchInitialData = async () => {
      await loadData();
    };
    void fetchInitialData();
  }, [user, loadData]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !canCreateClinicalEvolution) return;

    setIsSubmitting(true);
    try {
      await medicalRecordsService.create(patientId, newNote, selectedFile);

      setNewNote('');
      setSelectedFile(null);

      const fileInput = document.getElementById(
        'file-upload',
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      await loadData();
    } catch (error) {
      console.error('Error al guardar la nota', error);
      const message = isAxiosError(error)
        ? error.response?.data?.message || 'Error al guardar la evolución clínica'
        : 'Error al guardar la evolución clínica';
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAddendum = async (
    e: React.FormEvent,
    parentRecordId: string,
  ) => {
    e.preventDefault();
    if (!addendumText.trim() || !canCreateClinicalEvolution) return;

    setIsSubmittingAddendum(true);
    try {
      await medicalRecordsService.createAddendum(
        parentRecordId,
        addendumText.trim(),
      );
      setAddendumText('');
      setActiveAddendumRecordId(null);
      await loadData();
    } catch (error) {
      console.error('Error al registrar adenda:', error);
      const message = isAxiosError(error)
        ? error.response?.data?.message || 'Error al registrar la adenda'
        : 'Error al registrar la adenda';
      alert(message);
    } finally {
      setIsSubmittingAddendum(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-slate-500 flex items-center gap-2">
        <RefreshCw className="animate-spin" size={18} />
        Cargando ficha del paciente...
      </div>
    );
  }

  if (loadError || !patient) {
    return (
      <div className="max-w-3xl mx-auto p-6 bg-red-50 border border-red-200 rounded-xl space-y-4">
        <div className="flex items-center gap-3 text-red-700">
          <AlertTriangle size={24} />
          <div>
            <h2 className="font-bold text-lg">
              No se pudo cargar la ficha del paciente
            </h2>
            <p className="text-sm">
              {loadError || 'El paciente no se encuentra disponible.'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void loadData()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Reintentar
          </button>
          <Link
            href="/dashboard/patients"
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Volver al padrón
          </Link>
        </div>
      </div>
    );
  }

  const now = new Date();

  const upcomingAppointments =
    patient.appointments?.filter(
      (app) => new Date(app.date) >= now && app.status !== 'CANCELLED',
    ) || [];

  const pastAppointments =
    patient.appointments
      ?.filter((app) => new Date(app.date) < now || app.status === 'CANCELLED')
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ) || [];

  const getStatusBadge = (status: string) => {
    const meta =
      APPOINTMENT_STATUS_META[status as AppointmentStatusType] ?? null;
    if (!meta) return null;
    return (
      <span
        className={`px-2 py-1 text-[10px] font-semibold rounded ${meta.badgeClass}`}
      >
        {meta.label}
      </span>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/patients"
            aria-label="Volver al padrón de pacientes"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {patient.lastName}, {patient.firstName}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Documento / C.I.: {patient.documentId} | Edad:{' '}
              {calculateCivilAge(patient.birthDate)} años
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAppointmentModalOpen(true)}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm"
        >
          <CalendarPlus size={20} />
          <span className="hidden sm:inline">Nuevo Turno</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {/* Solo MEDICO puede crear evoluciones clínicas (T02 / S03) */}
          {canCreateClinicalEvolution && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 mb-4 text-blue-600">
                <Stethoscope size={20} />
                <h2 className="font-bold text-slate-800">Nueva Evolución</h2>
              </div>

              <form onSubmit={handleAddNote} className="space-y-4">
                <div>
                  <label
                    htmlFor="clinical-evolution-notes"
                    className="sr-only"
                  >
                    Notas de evolución clínica
                  </label>
                  <textarea
                    id="clinical-evolution-notes"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="w-full h-32 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    placeholder="Escriba los síntomas, diagnóstico o tratamiento indicado..."
                    required
                  />
                </div>

                <div className="relative">
                  <input
                    type="file"
                    id="file-upload"
                    onChange={(e) =>
                      setSelectedFile(
                        e.target.files ? e.target.files[0] : null,
                      )
                    }
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                  />
                  <label
                    htmlFor="file-upload"
                    className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <Paperclip size={16} className="text-slate-400" />
                    <span className="truncate">
                      {selectedFile
                        ? selectedFile.name
                        : 'Adjuntar PDF o Imagen (máx. 10 MB)'}
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !newNote.trim()}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center justify-center gap-2"
                >
                  <Send size={18} />
                  {isSubmitting ? 'Guardando...' : 'Guardar Registro'}
                </button>
              </form>
            </div>
          )}

          {/* Caja 2: Resumen de Turnos (Visible para todos) */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3 text-emerald-600">
                <CalendarDays size={18} />
                <h3 className="font-bold text-slate-800 text-sm">
                  Próximos Turnos
                </h3>
              </div>
              <div className="space-y-3">
                {upcomingAppointments.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    No hay turnos futuros programados.
                  </p>
                ) : (
                  upcomingAppointments.map((app) => (
                    <div
                      key={app.id}
                      className="p-3 border border-slate-100 bg-slate-50 rounded-lg"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-semibold text-slate-800">
                          {formatClinicDate(app.date)} {formatClinicTime(app.date)} hs
                        </span>
                        {getStatusBadge(app.status)}
                      </div>
                      <p className="text-xs text-slate-600 truncate">
                        {app.specialty.name} - {app.doctor.name}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <hr className="border-slate-100" />

            <div>
              <div className="flex items-center gap-2 mb-3 text-slate-500">
                <History size={18} />
                <h3 className="font-bold text-slate-800 text-sm">
                  Últimos Turnos Pasados
                </h3>
              </div>
              <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {pastAppointments.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    No registra turnos previos.
                  </p>
                ) : (
                  pastAppointments.map((app) => (
                    <div
                      key={app.id}
                      className="p-2 border-b border-slate-100 last:border-0 flex justify-between items-center"
                    >
                      <div>
                        <p className="text-xs font-medium text-slate-700">
                          {app.specialty.name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {formatClinicDate(app.date)} - {app.doctor.name}
                        </p>
                      </div>
                      <div>{getStatusBadge(app.status)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Historial Clínico */}
        <div className="lg:col-span-2">
          {!canReadClinicalHistory ? (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-slate-400 min-h-100">
              <Lock size={48} className="text-slate-300 mb-4" />
              <p className="font-semibold text-lg text-slate-600">
                Acceso Restringido
              </p>
              <p className="text-sm mt-1">
                La historia clínica es de uso exclusivo para profesionales
                autorizados.
              </p>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Clock size={20} className="text-slate-400" />
                Historial Clínico
              </h2>

              <div className="space-y-6">
                {records.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">
                    Este paciente no tiene evoluciones registradas.
                  </p>
                ) : (
                  records.map((record) => (
                    <div
                      key={record.id}
                      className="relative pl-6 border-l-2 border-slate-200 pb-2"
                    >
                      <div className="absolute w-3 h-3 bg-blue-500 rounded-full -left-1.75 top-1.5 border-2 border-white"></div>
                      <div className="mb-1 flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-700">
                            Atendido por {record.doctor.name}
                          </p>
                          {record.parentRecordId && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded">
                              Adenda / Aclaración
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                          {formatClinicDate(record.createdAt)}{' '}
                          {formatClinicTime(record.createdAt)} hs
                        </span>
                      </div>
                      <p className="text-slate-600 text-sm whitespace-pre-wrap mb-3">
                        {record.notes}
                      </p>

                      {record.attachments && record.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {record.attachments.map((url, index) => (
                            <a
                              key={index}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-md text-xs font-medium hover:bg-blue-100 transition-colors"
                            >
                              <FileIcon size={14} />
                              Ver Estudio Adjunto
                            </a>
                          ))}
                        </div>
                      )}

                      {(record.missingAttachmentsCount ?? 0) > 0 && (
                        <p className="text-xs text-amber-600 italic mb-2">
                          Adjunto temporalmente no disponible en el almacenamiento.
                        </p>
                      )}

                      {canCreateClinicalEvolution && !record.parentRecordId && (
                        <div className="mt-2">
                          {activeAddendumRecordId === record.id ? (
                            <form
                              onSubmit={(e) => handleAddAddendum(e, record.id)}
                              className="mt-2 space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200"
                            >
                              <textarea
                                value={addendumText}
                                onChange={(e) =>
                                  setAddendumText(e.target.value)
                                }
                                placeholder="Escriba la aclaración o adenda clínica (la evolución original se conserva íntegra)..."
                                className="w-full h-20 px-3 py-2 text-xs border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
                                required
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveAddendumRecordId(null);
                                    setAddendumText('');
                                  }}
                                  className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="submit"
                                  disabled={
                                    isSubmittingAddendum ||
                                    !addendumText.trim()
                                  }
                                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {isSubmittingAddendum
                                    ? 'Guardando...'
                                    : 'Firmar Adenda'}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setActiveAddendumRecordId(record.id)
                              }
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors"
                            >
                              <MessageSquarePlus size={13} />
                              Agregar adenda / aclaración
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <NewAppointmentModal
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        onSuccess={() => {
          setIsAppointmentModalOpen(false);
          void loadData();
        }}
        preselectedPatientId={patient.id}
      />
    </div>
  );
}
