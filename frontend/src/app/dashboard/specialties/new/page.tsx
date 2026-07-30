'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { specialtiesService } from '@/services/specialties.service';
import { ArrowLeft, Save, Stethoscope } from 'lucide-react';
import Link from 'next/link';

export default function NewSpecialtyPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validación básica del frontend
    if (!name.trim()) {
      setError('El nombre de la especialidad es obligatorio.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      
      await specialtiesService.create({
        name: name.trim(),
        description: description.trim() || undefined,
      });

      // Si todo sale bien, volvemos a la lista de especialidades
      router.push('/dashboard/specialties');
    } catch (err: unknown) {
      console.error('Error creando especialidad:', err);
      const errorResponse = err as { response?: { status?: number } };
      
      // Atrapamos el error de conflicto (409) si el nombre ya existe en la base de datos
      if (errorResponse.response?.status === 409) {
        setError('Ya existe una especialidad registrada con este nombre.');
      } else {
        setError('Ocurrió un error inesperado al guardar. Por favor, intentá nuevamente.');
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link 
          href="/dashboard/specialties" 
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Stethoscope className="text-emerald-600" size={24} />
            Nueva Especialidad
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Agregá una nueva rama médica para asignarle a los profesionales.
          </p>
        </div>
      </div>

      {/* Formulario */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm font-medium">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                Nombre de la Especialidad <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Cardiología, Pediatría, Traumatología..."
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                required
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
                Descripción (Opcional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve detalle de las afecciones que trata o notas internas..."
                rows={4}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow resize-none"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Link
              href="/dashboard/specialties"
              className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-6 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:bg-emerald-400 flex items-center gap-2"
            >
              <Save size={18} />
              {isSubmitting ? 'Guardando...' : 'Guardar Especialidad'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}