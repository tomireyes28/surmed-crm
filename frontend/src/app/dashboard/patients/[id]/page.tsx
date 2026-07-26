'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { patientsService } from '@/services/patients.service';
import { medicalRecordsService } from '@/services/medicalRecords.service';
import { Patient } from '@/schemas/patient.schema';
import Link from 'next/link';
import { ArrowLeft, Stethoscope, Clock, Send, Paperclip, FileText as FileIcon, CalendarPlus, CalendarDays, History } from 'lucide-react';
import { NewAppointmentModal } from '../../appointments/components/NewAppointmentModal';

interface MedicalRecord {
  id: string;
  notes: string;
  attachments: string[];
  createdAt: string;
  doctor: {
    name: string;
    email: string;
  };
}

// --- NUEVO: Interfaz para los turnos integrados ---
interface EmbeddedAppointment {
  id: string;
  date: string;
  status: string;
  doctor: { name: string };
  specialty: { name: string };
}

// Extendemos la interfaz Patient temporalmente aquí para aceptar appointments
interface PatientWithAppointments extends Patient {
  appointments?: EmbeddedAppointment[];
}

export default function PatientDetailPage() {
  const params = useParams();
  const patientId = params.id as string;
  
  const [patient, setPatient] = useState<PatientWithAppointments | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  
  const [newNote, setNewNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const patientData = await patientsService.getById(patientId);
      setPatient(patientData);
      
      const recordsData = await medicalRecordsService.getByPatientId(patientId);
      setRecords(recordsData);
    } catch (error) {
      console.error('Error cargando el historial:', error);
    }
  }, [patientId]);

  useEffect(() => {
    const fetchInitialData = async () => {
      await loadData();
    };
    fetchInitialData();
  }, [loadData]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setIsSubmitting(true);
    try {
      await medicalRecordsService.create(patientId, newNote, selectedFile);
      
      setNewNote('');
      setSelectedFile(null); 
      
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      await loadData();
    } catch (error) {
      console.error('Error al guardar la nota', error);
      alert('Error al guardar la evolución');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!patient) return <div className="p-8 text-slate-500">Cargando paciente...</div>;

  // --- LÓGICA DE TURNOS ---
  const now = new Date();
  
  // Próximos turnos (futuros y no cancelados)
  const upcomingAppointments = patient.appointments?.filter(app => 
    new Date(app.date) >= now && app.status !== 'CANCELLED'
  ) || [];

  // Turnos pasados o cancelados
  const pastAppointments = patient.appointments?.filter(app => 
    new Date(app.date) < now || app.status === 'CANCELLED'
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || []; // Ordenados del más reciente al más antiguo


  // Helper para el badge de estado
  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'PENDING': return <span className="px-2 py-1 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded">Pendiente</span>;
      case 'CONFIRMED': return <span className="px-2 py-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded">Confirmado</span>;
      case 'IN_WAITING_ROOM': return <span className="px-2 py-1 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded">En Espera</span>;
      case 'ATTENDED': return <span className="px-2 py-1 text-[10px] font-semibold bg-purple-100 text-purple-700 rounded">Atendido</span>;
      case 'CANCELLED': return <span className="px-2 py-1 text-[10px] font-semibold bg-red-100 text-red-700 rounded">Cancelado</span>;
      default: return null;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* Header del Paciente */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/patients" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {patient.lastName}, {patient.firstName}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              DNI: {patient.documentId} | Edad: {new Date().getFullYear() - new Date(patient.birthDate).getFullYear()} años
            </p>
          </div>
        </div>
        
        <button 
          onClick={() => setIsAppointmentModalOpen(true)}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm"
        >
          <CalendarPlus size={20} />
          <span className="hidden sm:inline">Nuevo Turno</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Columna Izquierda */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Caja 1: Nueva Evolución */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-4 text-blue-600">
              <Stethoscope size={20} />
              <h2 className="font-bold text-slate-800">Nueva Evolución</h2>
            </div>
            
            <form onSubmit={handleAddNote} className="space-y-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="w-full h-32 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                placeholder="Escriba los síntomas, diagnóstico o tratamiento indicado..."
                required
              />
              
              <div className="relative">
                <input
                  type="file"
                  id="file-upload"
                  onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                  className="hidden"
                  accept=".pdf,image/*"
                />
                <label 
                  htmlFor="file-upload"
                  className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <Paperclip size={16} className="text-slate-400" />
                  <span className="truncate">
                    {selectedFile ? selectedFile.name : 'Adjuntar PDF o Imagen'}
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

          {/* Caja 2: Resumen de Turnos */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-6">
            
            {/* Próximos Turnos */}
            <div>
              <div className="flex items-center gap-2 mb-3 text-emerald-600">
                <CalendarDays size={18} />
                <h3 className="font-bold text-slate-800 text-sm">Próximos Turnos</h3>
              </div>
              <div className="space-y-3">
                {upcomingAppointments.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No hay turnos futuros programados.</p>
                ) : (
                  upcomingAppointments.map(app => (
                    <div key={app.id} className="p-3 border border-slate-100 bg-slate-50 rounded-lg">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-semibold text-slate-800">
                          {new Date(app.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} hs
                        </span>
                        {getStatusBadge(app.status)}
                      </div>
                      <p className="text-xs text-slate-600 truncate">{app.specialty.name} - {app.doctor.name}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* Historial de Turnos */}
            <div>
              <div className="flex items-center gap-2 mb-3 text-slate-500">
                <History size={18} />
                <h3 className="font-bold text-slate-800 text-sm">Últimos Turnos Pasados</h3>
              </div>
              <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {pastAppointments.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No registra turnos previos.</p>
                ) : (
                  pastAppointments.map(app => (
                    <div key={app.id} className="p-2 border-b border-slate-100 last:border-0 flex justify-between items-center">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{app.specialty.name}</p>
                        <p className="text-[10px] text-slate-400">
                           {new Date(app.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })} - {app.doctor.name}
                        </p>
                      </div>
                      <div>
                         {getStatusBadge(app.status)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>

        {/* Columna Derecha: Historial Histórico (Sin cambios) */}
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Clock size={20} className="text-slate-400" />
              Historial Clínico
            </h2>

            <div className="space-y-6">
              {records.length === 0 ? (
                <p className="text-slate-500 text-center py-8">Este paciente no tiene evoluciones registradas.</p>
              ) : (
                records.map((record) => (
                  <div key={record.id} className="relative pl-6 border-l-2 border-slate-200 pb-2">
                    <div className="absolute w-3 h-3 bg-blue-500 rounded-full -left-1.75 top-1.5 border-2 border-white"></div>
                    <div className="mb-1 flex justify-between items-start">
                      <p className="text-sm font-semibold text-slate-700">
                        Atendido por {record.doctor.name}
                      </p>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                        {new Date(record.createdAt).toLocaleDateString('es-AR', {
                          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-slate-600 text-sm whitespace-pre-wrap mb-3">{record.notes}</p>
                    
                    {record.attachments && record.attachments.length > 0 && (
                      <div className="flex gap-2">
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
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
      </div>

      <NewAppointmentModal 
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        onSuccess={() => {
          setIsAppointmentModalOpen(false);
          loadData(); // Recargamos para que el turno nuevo aparezca en "Próximos Turnos"
        }}
        preselectedPatientId={patient.id} 
      />
    </div>
  );
}