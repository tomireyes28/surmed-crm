'use client';

import { useEffect, useState, useCallback } from 'react';
import { specialtiesService, SpecialtyWithCount } from '@/services/specialties.service';
import { Search, Plus, Pencil, Trash2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

export default function SpecialtiesPage() {
  const [specialties, setSpecialties] = useState<SpecialtyWithCount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Leemos el rol del usuario para aplicar seguridad visual (RBAC)
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';

  const fetchSpecialties = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await specialtiesService.getAll();
      setSpecialties(data);
    } catch (error) {
      console.error('Error cargando especialidades:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSpecialties();
  }, [fetchSpecialties]);

  const handleDelete = async (id: string, name: string) => {
    const isConfirmed = window.confirm(`¿Estás seguro de que deseas eliminar la especialidad "${name}"?`);
    
    if (isConfirmed) {
      try {
        setIsLoading(true);
        await specialtiesService.delete(id);
        fetchSpecialties();
      } catch (error) { 
        console.error('Error al eliminar:', error);
        
        const err = error as { response?: { status?: number } };
        
        if (err.response?.status === 409) {
          alert('No se puede eliminar la especialidad porque hay médicos asignados a ella.');
        } else {
          alert('Ocurrió un error al intentar eliminar la especialidad.');
        }
        setIsLoading(false);
      }
    }
  };

  const filteredSpecialties = specialties.filter((spec) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      spec.name.toLowerCase().includes(searchLower) ||
      (spec.description && spec.description.toLowerCase().includes(searchLower))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Especialidades Médicas</h1>
          <p className="text-slate-500 text-sm mt-1">Gestiona las áreas de atención de la clínica.</p>
        </div>
        
        <div className="flex w-full sm:w-auto gap-4">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Buscar especialidad..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          
          {/* SOLO ADMIN PUEDE CREAR */}
          {isAdmin && (
            <Link 
              href="/dashboard/specialties/new"
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">Nueva Especialidad</span>
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Nombre de la Especialidad</th>
                <th className="px-6 py-4 font-medium">Descripción</th>
                <th className="px-6 py-4 font-medium text-center">Médicos Asignados</th>
                {isAdmin && <th className="px-6 py-4 font-medium text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="px-6 py-8 text-center text-slate-500">
                    Cargando especialidades...
                  </td>
                </tr>
              ) : filteredSpecialties.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="px-6 py-8 text-center text-slate-500">
                    No se encontraron especialidades registradas.
                  </td>
                </tr>
              ) : (
                filteredSpecialties.map((spec) => {
                  const doctorsCount = spec._count?.doctors || 0;
                  const canDelete = doctorsCount === 0;

                  return (
                    <tr key={spec.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-sm font-bold text-slate-700">
                        {spec.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">
                        {spec.description || <span className="italic text-slate-300">Sin descripción</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          doctorsCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {doctorsCount}
                        </span>
                      </td>
                      
                      {/* SOLO ADMIN PUEDE EDITAR/BORRAR */}
                      {isAdmin && (
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                            <Link 
                              href={`/dashboard/specialties/${spec.id}/edit`}
                              title="Editar Especialidad"
                              className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <Pencil size={18} />
                            </Link>
                            
                            {/* Botón Borrar: Bloqueado si hay médicos */}
                            <button 
                              onClick={() => canDelete ? handleDelete(spec.id, spec.name) : alert('No podés borrar una especialidad con médicos asignados.')}
                              title={canDelete ? "Borrar Especialidad" : "Tiene médicos asignados"}
                              className={`p-2 rounded-lg transition-colors ${
                                canDelete 
                                ? 'text-red-600 hover:bg-red-50' 
                                : 'text-slate-300 cursor-not-allowed'
                              }`}
                            >
                              {canDelete ? <Trash2 size={18} /> : <ShieldAlert size={18} />}
                            </button>
                          </div>
                        </td>
                      )}
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