'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Users, Shield, Stethoscope } from 'lucide-react';
import { usersService, User } from '@/services/users.service'; // Usamos el servicio y la interfaz

export default function StaffPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await usersService.getAll();
        setUsers(data);
      } catch (error) {
        console.error('Error cargando empleados:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Users className="text-emerald-600" />
          Staff de la Clínica
        </h1>
        
        <Link 
          href="/dashboard/staff/new"
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          <Plus size={20} />
          Nuevo Empleado
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
              <th className="px-6 py-4 font-medium">Nombre Completo</th>
              <th className="px-6 py-4 font-medium">Email</th>
              <th className="px-6 py-4 font-medium">Rol</th>
              <th className="px-6 py-4 font-medium">Especialidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">Cargando equipo...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">No hay empleados registrados.</td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-slate-800">{user.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{user.email}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                      ${user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 
                        user.role === 'MEDICO' ? 'bg-blue-100 text-blue-700' : 
                        'bg-slate-100 text-slate-700'}`}>
                      {user.role === 'ADMIN' && <Shield size={12} />}
                      {user.role === 'MEDICO' && <Stethoscope size={12} />}
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {user.role === 'MEDICO' && user.specialties && user.specialties.length > 0 
                      ? user.specialties.map(s => s.name).join(', ') 
                      : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}