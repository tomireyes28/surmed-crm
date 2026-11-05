'use client';

import { useEffect, useState } from 'react';
import { patientsService } from '@/services/patients.service';
import { Patient } from '@/schemas/patient.schema';
import {
  Search,
  Plus,
  FileText,
  Pencil,
  ArchiveX,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { calculateCivilAge } from '@/utils/format';
import { ROLE_PERMISSIONS } from '@/utils/domain-rules';
import { useAuthStore } from '@/store/authStore';
import { ErrorAlert } from '@/components/ui/PageState';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { isAxiosError } from 'axios';

export default function PatientsPage() {
  const user = useAuthStore((state) => state.user);
  const canArchive = ROLE_PERMISSIONS.canArchivePatient(user?.role);
  const canReactivate = ROLE_PERMISSIONS.canReactivatePatient(user?.role);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setIsLoading(true);
        const response = await patientsService.getAll(
          currentPage,
          limit,
          searchTerm,
          showArchived,
        );
        if (cancelled) return;
        setPatients(response.data);
        setTotalPages(Math.max(1, response.meta.totalPages));
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error('Error cargando pacientes:', error);
        setLoadError(
          'No se pudo cargar el padrón de pacientes. Verifique su conexión.',
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentPage, searchTerm, showArchived, reloadKey]);

  const handleArchive = async (id: string, name: string) => {
    const isConfirmed = window.confirm(
      `¿Está seguro de que desea archivar a ${name}? Dejará de aparecer en las listas activas.`,
    );
    if (!isConfirmed) return;

    try {
      setIsLoading(true);
      await patientsService.archive(id);
      setReloadKey((k) => k + 1);
    } catch (error) {
      console.error('Error al archivar:', error);
      const msg = isAxiosError(error)
        ? error.response?.data?.message
        : 'Hubo un problema al archivar el paciente.';
      alert(msg || 'Hubo un problema al archivar el paciente.');
      setIsLoading(false);
    }
  };

  const handleReactivate = async (id: string, name: string) => {
    const isConfirmed = window.confirm(
      `¿Desea reactivar al paciente ${name} en el padrón activo?`,
    );
    if (!isConfirmed) return;

    try {
      setIsLoading(true);
      await patientsService.reactivate(id);
      setReloadKey((k) => k + 1);
    } catch (error) {
      console.error('Error al reactivar:', error);
      alert('No se pudo reactivar el paciente.');
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pacientes</h1>
          <p className="text-sm text-slate-500">
            Padrón general con búsqueda en servidor por apellido, nombre o documento.
          </p>
        </div>

        <div className="flex flex-wrap w-full md:w-auto items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              id="patients-search"
              type="search"
              aria-label="Buscar paciente por apellido, nombre o documento"
              placeholder="Buscar nombre o documento..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-3 py-2.5 rounded-lg border border-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => {
                setShowArchived(e.target.checked);
                setCurrentPage(1);
              }}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Incluir archivados
          </label>

          <Link
            href="/dashboard/patients/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm text-sm"
          >
            <Plus size={18} />
            Nuevo Paciente
          </Link>
        </div>
      </div>

      {loadError && (
        <ErrorAlert
          message={loadError}
          onRetry={() => {
            setIsLoading(true);
            setLoadError(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Documento / C.I.</th>
                <th className="px-6 py-4 font-medium">Nombre Completo</th>
                <th className="px-6 py-4 font-medium">Teléfono</th>
                <th className="px-6 py-4 font-medium">Edad Civil</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    Cargando pacientes...
                  </td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    No se encontraron pacientes con los criterios actuales.
                  </td>
                </tr>
              ) : (
                patients.map((patient) => {
                  const age = calculateCivilAge(patient.birthDate);
                  const isArchived = patient.isActive === false;

                  return (
                    <tr
                      key={patient.id}
                      className={`transition-colors ${
                        isArchived
                          ? 'bg-slate-50/70 text-slate-400'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-6 py-4 text-sm font-medium text-slate-700">
                        {patient.documentId}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-800">
                        <div className="flex items-center gap-2">
                          <span>
                            {patient.lastName}, {patient.firstName}
                          </span>
                          {isArchived && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-200 text-slate-600 rounded uppercase">
                              Archivado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {patient.phone || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {age} años
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/patients/${patient.id}`}
                            title="Ficha e Historia Clínica"
                            aria-label={`Ver ficha de ${patient.lastName}, ${patient.firstName}`}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <FileText size={18} />
                          </Link>
                          <Link
                            href={`/dashboard/patients/${patient.id}/edit`}
                            title="Editar Paciente"
                            aria-label={`Editar datos de ${patient.lastName}, ${patient.firstName}`}
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          >
                            <Pencil size={18} />
                          </Link>
                          {isArchived && canReactivate ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleReactivate(
                                  patient.id,
                                  `${patient.lastName}, ${patient.firstName}`,
                                )
                              }
                              title="Reactivar Paciente"
                              aria-label={`Reactivar a ${patient.lastName}, ${patient.firstName}`}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <RotateCcw size={18} />
                            </button>
                          ) : (
                            !isArchived &&
                            canArchive && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleArchive(
                                    patient.id,
                                    `${patient.lastName}, ${patient.firstName}`,
                                  )
                                }
                                title="Archivar Paciente"
                                aria-label={`Archivar a ${patient.lastName}, ${patient.firstName}`}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <ArchiveX size={18} />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          isLoading={isLoading}
          onPageChange={(page) => setCurrentPage(page)}
        />
      </div>
    </div>
  );
}
