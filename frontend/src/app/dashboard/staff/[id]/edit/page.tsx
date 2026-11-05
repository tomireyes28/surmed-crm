'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Shield,
  Stethoscope,
  UserCog,
  Loader2,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import { usersService, UpdateUserDto } from '@/services/users.service';
import {
  specialtiesService,
  SpecialtyWithCount,
} from '@/services/specialties.service';
import { ErrorAlert, LoadingState } from '@/components/ui/PageState';

export default function EditStaffPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [specialties, setSpecialties] = useState<SpecialtyWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    role: 'ADMIN' | 'MEDICO' | 'RECEPCION';
    specialtyId: string;
    password: string;
  }>({
    name: '',
    email: '',
    role: 'RECEPCION',
    specialtyId: '',
    password: '',
  });

  const [initialForm, setInitialForm] = useState(formData);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const [userData, specialtiesData] = await Promise.all([
          usersService.getById(userId),
          specialtiesService.getAll(),
        ]);

        if (cancelled) return;
        const primarySpecialty = userData.specialties?.[0]?.id || '';
        const loaded = {
          name: userData.name,
          email: userData.email,
          role: (userData.role as 'ADMIN' | 'MEDICO' | 'RECEPCION') || 'RECEPCION',
          specialtyId: primarySpecialty,
          password: '',
        };
        setFormData(loaded);
        setInitialForm(loaded);
        setSpecialties(specialtiesData);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error('Error cargando empleado:', error);
        setLoadError(
          isAxiosError(error) && error.response?.status === 404
            ? 'El usuario solicitado no existe.'
            : 'No se pudo cargar la información del empleado.',
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const isDirty =
    formData.name !== initialForm.name ||
    formData.email !== initialForm.email ||
    formData.role !== initialForm.role ||
    formData.specialtyId !== initialForm.specialtyId ||
    formData.password.length > 0;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (formData.password && formData.password.trim().length < 8) {
      setFormError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (formData.role === 'MEDICO' && !formData.specialtyId) {
      setFormError('Debe asignar una especialidad principal al rol MEDICO.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: UpdateUserDto = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role,
        specialtyId: formData.role === 'MEDICO' ? formData.specialtyId : '',
        ...(formData.password.trim()
          ? { password: formData.password.trim() }
          : {}),
      };

      await usersService.update(userId, payload);
      router.push('/dashboard/staff');
    } catch (error) {
      console.error('Error actualizando empleado:', error);
      if (isAxiosError(error)) {
        const msg = error.response?.data?.message;
        setFormError(
          Array.isArray(msg)
            ? msg.join(', ')
            : msg || 'No se pudo actualizar el empleado.',
        );
      } else {
        setFormError('Ocurrió un error inesperado al actualizar el empleado.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Cargando datos del miembro del staff..." />;
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <ErrorAlert
          message={loadError}
          onRetry={() => {
            setIsLoading(true);
            setLoadError(null);
            setReloadKey((k) => k + 1);
          }}
        />
        <Link
          href="/dashboard/staff"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft size={16} /> Volver al listado de Staff
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <Link
          href="/dashboard/staff"
          aria-label="Volver a Staff"
          onClick={(e) => {
            if (
              isDirty &&
              !window.confirm('Tiene cambios sin guardar. ¿Desea salir igualmente?')
            ) {
              e.preventDefault();
            }
          }}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <UserCog className="text-amber-600" />
            Editar Empleado
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Actualice datos de acceso, rol operativo o especialidad médica.
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <form onSubmit={handleSubmit} className="space-y-6">
          {formError && <ErrorAlert message={formError} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-700 flex items-center gap-2 border-b pb-2 text-base">
                <Shield size={18} /> Datos de Cuenta
              </h2>

              <div>
                <label
                  htmlFor="edit-staff-name"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Nombre Completo *
                </label>
                <input
                  id="edit-staff-name"
                  required
                  minLength={2}
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-staff-email"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Email *
                </label>
                <input
                  id="edit-staff-email"
                  required
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-staff-password"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Nueva contraseña (opcional, mín. 8 caracteres)
                </label>
                <input
                  id="edit-staff-password"
                  type="password"
                  name="password"
                  minLength={8}
                  maxLength={72}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Dejar en blanco para mantener la actual"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="font-semibold text-slate-700 flex items-center gap-2 border-b pb-2 text-base">
                <Stethoscope size={18} /> Perfil Operativo
              </h2>

              <div>
                <label
                  htmlFor="edit-staff-role"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Rol en el sistema *
                </label>
                <select
                  id="edit-staff-role"
                  required
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="RECEPCION">Recepción / Administrativo</option>
                  <option value="MEDICO">Médico Especialista</option>
                  <option value="ADMIN">Administrador General</option>
                </select>
              </div>

              {formData.role === 'MEDICO' && (
                <div>
                  <label
                    htmlFor="edit-staff-specialty"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Especialidad Principal *
                  </label>
                  <select
                    id="edit-staff-specialty"
                    required
                    name="specialtyId"
                    value={formData.specialtyId}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Seleccione especialidad...</option>
                    {specialties.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
            <Link
              href="/dashboard/staff"
              onClick={(e) => {
                if (
                  isDirty &&
                  !window.confirm('Tiene cambios sin guardar. ¿Desea cancelar?')
                ) {
                  e.preventDefault();
                }
              }}
              className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors flex items-center gap-2 disabled:opacity-70"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Save size={20} />
              )}
              {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
