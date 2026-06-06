'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation'; // Borramos el useRouter porque no lo usábamos
import { patientsService } from '@/services/patients.service';
import { medicalRecordsService } from '@/services/medicalRecords.service';
import { Patient } from '@/schemas/patient.schema';
import Link from 'next/link';
import { ArrowLeft, Stethoscope, Clock, Send } from 'lucide-react';

// 1. Creamos la interfaz para matar el "any"
interface MedicalRecord {
  id: string;
  notes: string;
  createdAt: string;
  doctor: {
    name: string;
    email: string;
  };
}

export default function PatientDetailPage() {
  const params = useParams();
  const patientId = params.id as string;
  
  const [patient, setPatient] = useState<Patient | null>(null);
  // 2. Le pasamos la interfaz al estado
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 3. Envolvemos la función en useCallback para que React no se queje en el useEffect
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

  // 4. Ahora sí, el useEffect tiene su dependencia correcta
  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setIsSubmitting(true);
    try {
      await medicalRecordsService.create(patientId, newNote);
      setNewNote('');
      await loadData();
    } catch (error) {
      console.error('Error al guardar la nota', error);
      alert('Error al guardar la evolución');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!patient) return <div className="p-8 text-slate-500">Cargando paciente...</div>;

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Columna Izquierda: Nueva Evolución */}
        <div className="lg:col-span-1 space-y-6">
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
        </div>

        {/* Columna Derecha: Historial Histórico */}
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
                    <p className="text-slate-600 text-sm whitespace-pre-wrap">{record.notes}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}