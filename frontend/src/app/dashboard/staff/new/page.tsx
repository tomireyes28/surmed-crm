'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Shield, Stethoscope, Save, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { specialtiesService, Specialty } from '@/services/specialties.service';
import { usersService, CreateUserDto } from '@/services/users.service';
import { isAxiosError } from 'axios';

export default function NewEmployeePage() {
  const router = useRouter();
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState<CreateUserDto>({
    name: '',
    email: '',
    password: '',
    role: 'RECEPCION', 
    specialtyId: '', 
  });

  useEffect(() => {
    const loadSpecialties = async () => {
      try {
        const data = await specialtiesService.getAll();
        setSpecialties(data);
      } catch (error) {
        console.error('Error cargando especialidades:', error);
      }
    };
    loadSpecialties();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await usersService.create(formData);
      router.push('/dashboard/staff'); 
    } catch (error) {
      console.error('Error al crear usuario:', error);
      if (isAxiosError(error)) {
        alert(error.response?.data?.message || 'Error al crear empleado');
      } else {
        alert('Hubo un problema inesperado al registrar el usuario.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <Link href="/dashboard/staff" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <UserPlus className="text-emerald-600" />
            Alta de Nuevo Empleado
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gestión de accesos y roles para el equipo de la clínica.
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2 border-b pb-2">
                <Shield size={18} /> Datos de Acceso
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo *</label>
                <input required type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Ej: Dra. Ana Martínez" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <input required type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" placeholder="ana@surmed.com" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña provisoria *</label>
                <input required type="password" name="password" value={formData.password} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2 border-b pb-2">
                <Stethoscope size={18} /> Perfil Operativo
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rol en el sistema *</label>
                <select required name="role" value={formData.role} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="RECEPCION">Recepción / Administrativo</option>
                  <option value="MEDICO">Médico Especialista</option>
                  <option value="ADMIN">Administrador General</option>
                </select>
              </div>

              {formData.role === 'MEDICO' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Especialidad Principal *</label>
                  <select required name="specialtyId" value={formData.specialtyId} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">Seleccione especialidad...</option>
                    {specialties.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end">
            <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-70">
              {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              {isSubmitting ? 'Registrando...' : 'Dar de Alta Empleado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}