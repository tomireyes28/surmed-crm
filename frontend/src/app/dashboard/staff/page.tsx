'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus,
  Users,
  Shield,
  Stethoscope,
  Pencil,
  UserMinus,
  RotateCcw,
} from 'lucide-react';
import { usersService, User } from '@/services/users.service';
import { ErrorAlert } from '@/components/ui/PageState';
import { isAxiosError } from 'axios';

export default function StaffPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const data = await usersService.getAll(showInactive);
      setUsers(data);
    } catch (error) {
      console.error('Error cargando empleados:', error);
      setLoadError(
        'No se pudo cargar el listado de personal. Verifique la conexión.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    const load = async () => {
      await fetchUsers();
    };
    void load();
  }, [fetchUsers]);

  const handleDeactivate = async (id: string, name: string) => {
    const isConfirmed = window.confirm(
      `¿Está seguro de que desea revocar el acceso a ${name}? Su historial de atención se mantendrá intacto.`,
    );
    if (!isConfirmed) return;

    try {
      await usersService.deactivate(id);
      await fetchUsers();
    } catch (error) {
      console.error('Error al desactivar usuario:', error);
      const msg = isAxiosError(error)
        ? error.response?.data?.message
        : 'Hubo un problema al desactivar al empleado.';
      alert(msg || 'Hubo un problema al desactivar al empleado.');
    }
  };

  const handleReactivate = async (id: string, name: string) => {
    const isConfirmed = window.confirm(
      `¿Desea reactivar el acceso de ${name} al sistema?`,
    );
    if (!isConfirmed) return;

    try {
      await usersService.reactivate(id);
      await fetchUsers();
    } catch (error) {
      console.error('Error al reactivar usuario:', error);
      alert('No se pudo reactivar al empleado.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="text-emerald-600" />
            Staff de la Clínica
          </h1>
          <p className="text-sm text-slate-500">
            Administración de profesionales médicos, recepción y administradores.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-3 py-2.5 rounded-lg border border-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Incluir inactivos
          </label>

          <Link
            href="/dashboard/staff/new"
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 text-sm shadow-sm"
          >
            <Plus size={18} />
            Nuevo Empleado
          </Link>
        </div>
      </div>

      {loadError && (
        <ErrorAlert message={loadError} onRetry={() => void fetchUsers()} />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Nombre Completo</th>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-6 py-4 font-medium">Rol</th>
                <th className="px-6 py-4 font-medium">Especialidad</th>
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
                    Cargando equipo...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    No hay empleados registrados.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isInactive = user.isActive === false;
                  return (
                    <tr
                      key={user.id}
                      className={`transition-colors ${
                        isInactive
                          ? 'bg-slate-50/70 text-slate-400'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-6 py-4 text-sm font-medium text-slate-800">
                        <div className="flex items-center gap-2">
                          <span>{user.name}</span>
                          {isInactive && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-200 text-slate-600 rounded uppercase">
                              Inactivo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                            user.role === 'ADMIN'
                              ? 'bg-purple-100 text-purple-700'
                              : user.role === 'MEDICO'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {user.role === 'ADMIN' && <Shield size={12} />}
                          {user.role === 'MEDICO' && <Stethoscope size={12} />}
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {user.role === 'MEDICO' &&
                        user.specialties &&
                        user.specialties.length > 0
                          ? user.specialties.map((s) => s.name).join(', ')
                          : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/staff/${user.id}/edit`}
                            aria-label={`Editar a ${user.name}`}
                            title="Editar Empleado"
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          >
                            <Pencil size={18} />
                          </Link>
                          {isInactive ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleReactivate(user.id, user.name)
                              }
                              aria-label={`Reactivar acceso de ${user.name}`}
                              title="Reactivar Acceso"
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <RotateCcw size={18} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                void handleDeactivate(user.id, user.name)
                              }
                              aria-label={`Revocar acceso de ${user.name}`}
                              title="Revocar Acceso"
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <UserMinus size={18} />
                            </button>
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
      </div>
    </div>
  );
}
