'use client';

import { useEffect, useState, useCallback } from 'react';
import { patientsService } from '@/services/patients.service';
import { Patient } from '@/schemas/patient.schema';
import { Search, Plus, FileText, Pencil, ArchiveX, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  // Inicia en true, así que la primera carga ya está cubierta
  const [isLoading, setIsLoading] = useState(true);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;

  const fetchPatients = useCallback(async () => {
    try {
      const response = await patientsService.getAll(currentPage, limit);
      
      setPatients(response.data);
      setTotalPages(response.meta.totalPages);
    } catch (error) {
      console.error('Error cargando pacientes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage]); 

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPatients();
  }, [fetchPatients]);

  const handleArchive = async (id: string, name: string) => {
    const isConfirmed = window.confirm(`¿Estás seguro de que deseas archivar a ${name}? Dejará de aparecer en las listas principales.`);
    
    if (isConfirmed) {
      try {
        // Activamos el loading en el EVENTO, antes de llamar al backend
        setIsLoading(true);
        await patientsService.archive(id);
        fetchPatients(); 
      } catch (error) {
        console.error('Error al archivar:', error);
        alert('Hubo un problema al archivar el paciente.');
        setIsLoading(false); // Por si falla, lo apagamos
      }
    }
  };

  const filteredPatients = patients.filter((p) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      p.firstName.toLowerCase().includes(searchLower) ||
      p.lastName.toLowerCase().includes(searchLower) ||
      p.documentId.includes(searchTerm)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Pacientes</h1>
        
        <div className="flex w-full sm:w-auto gap-4">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Buscar en esta página..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          
          <Link 
            href="/dashboard/patients/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm"
          >
            <Plus size={20} />
            Nuevo Paciente
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Documento</th>
                <th className="px-6 py-4 font-medium">Nombre Completo</th>
                <th className="px-6 py-4 font-medium">Teléfono</th>
                <th className="px-6 py-4 font-medium">Edad</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Cargando pacientes...
                  </td>
                </tr>
              ) : filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No se encontraron pacientes.
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => {
                  const age = new Date().getFullYear() - new Date(patient.birthDate).getFullYear();
                  
                  return (
                    <tr key={patient.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700">
                        {patient.documentId}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-800">
                        {patient.lastName}, {patient.firstName}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {patient.phone || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {age} años
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                          <Link 
                            href={`/dashboard/patients/${patient.id}`}
                            title="Historia Clínica"
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <FileText size={18} />
                          </Link>
                          <Link 
                            href={`/dashboard/patients/${patient.id}/edit`}
                            title="Editar Paciente"
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          >
                            <Pencil size={18} />
                          </Link>
                          <button 
                            onClick={() => handleArchive(patient.id, `${patient.lastName}, ${patient.firstName}`)}
                            title="Archivar Paciente"
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <ArchiveX size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
            <span className="text-sm text-slate-500">
              Página <span className="font-medium text-slate-800">{currentPage}</span> de <span className="font-medium text-slate-800">{totalPages}</span>
            </span>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  // Activamos el loading en el EVENTO antes de que cambie la página
                  setIsLoading(true);
                  setCurrentPage(prev => Math.max(prev - 1, 1));
                }}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => {
                  // Activamos el loading en el EVENTO antes de que cambie la página
                  setIsLoading(true);
                  setCurrentPage(prev => Math.min(prev + 1, totalPages));
                }}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}