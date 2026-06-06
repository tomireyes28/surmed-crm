'use client';

import { useEffect, useState } from 'react';
import { patientsService } from '@/services/patients.service';
import { Patient } from '@/schemas/patient.schema';
import { Search, Plus, FileText } from 'lucide-react';
import Link from 'next/link';

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const data = await patientsService.getAll();
        setPatients(data);
      } catch (error) {
        console.error('Error cargando pacientes:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPatients();
  }, []);

  // Filtramos los pacientes según lo que el usuario escriba en el buscador
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
      {/* Header y Buscador */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Pacientes</h1>
        
        <div className="flex w-full sm:w-auto gap-4">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por nombre o DNI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          
          <Link 
            href="/dashboard/patients/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={20} />
            Nuevo Paciente
          </Link>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
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
                  // Calculamos la edad rápido
                  const age = new Date().getFullYear() - new Date(patient.birthDate).getFullYear();
                  
                  return (
                    <tr key={patient.id} className="hover:bg-slate-50 transition-colors">
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
                        <Link 
                          href={`/dashboard/patients/${patient.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center justify-end gap-1"
                        >
                          <FileText size={16} />
                          Historia Clínica
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}