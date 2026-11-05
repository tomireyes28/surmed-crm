'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { specialtiesService } from '@/services/specialties.service';
import { ArrowLeft, Save, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import { isAxiosError } from 'axios';
import { ErrorAlert, LoadingState } from '@/components/ui/PageState';

export default function EditSpecialtyPage() {
  const params = useParams();
  const router = useRouter();
  const specialtyId = params.id as string;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [initialName, setInitialName] = useState('');
  const [initialDescription, setInitialDescription] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadSpecialty = async () => {
      try {
        const data = await specialtiesService.getById(specialtyId);
        if (cancelled) return;
        setName(data.name);
        setDescription(data.description || '');
        setInitialName(data.name);
        setInitialDescription(data.description || '');
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error('Error cargando especialidad:', error);
        setLoadError(
          isAxiosError(error) && error.response?.status === 404
            ? 'La especialidad solicitada no existe.'
            : 'No se pudo cargar la especialidad. Verifique la conexión.',
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadSpecialty();
    return () => {
      cancelled = true;
    };
  }, [specialtyId, reloadKey]);

  const isDirty = name !== initialName || description !== initialDescription;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('El nombre de la especialidad es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      await specialtiesService.update(specialtyId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      router.push('/dashboard/specialties');
    } catch (error) {
      console.error('Error actualizando especialidad:', error);
      if (isAxiosError(error)) {
        if (error.response?.status === 409) {
          setFormError('Ya existe otra especialidad registrada con ese nombre.');
        } else {
          const msg = error.response?.data?.message;
          setFormError(
            Array.isArray(msg)
              ? msg.join(', ')
              : msg || 'Error al actualizar la especialidad.',
          );
        }
      } else {
        setFormError('Error inesperado al guardar los cambios.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Cargando especialidad..." />;
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
          href="/dashboard/specialties"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft size={16} /> Volver a Especialidades
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <Link
          href="/dashboard/specialties"
          aria-label="Volver a Especialidades"
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
            <Stethoscope className="text-amber-600" size={24} />
            Editar Especialidad
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Modifique el nombre o la descripción del área de atención médica.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {formError && <ErrorAlert message={formError} />}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="edit-specialty-name"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Nombre de la Especialidad <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-specialty-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isSubmitting}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="edit-specialty-description"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Descripción (Opcional)
              </label>
              <textarea
                id="edit-specialty-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={isSubmitting}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Link
              href="/dashboard/specialties"
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
              disabled={isSubmitting || !name.trim()}
              className="px-6 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              <Save size={18} />
              {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
