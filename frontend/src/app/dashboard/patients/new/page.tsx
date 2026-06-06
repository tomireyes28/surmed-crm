'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { patientSchema, PatientFormValues } from '@/schemas/patient.schema';
import { patientsService } from '@/services/patients.service';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';

export default function NewPatientPage() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      documentId: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      birthDate: '',
      address: '',
    }
  });

  const onSubmit = async (data: PatientFormValues) => {
    try {
      await patientsService.create(data);
      // Si sale bien, volvemos a la lista de pacientes
      router.push('/dashboard/patients');
    } catch (error: any) {
      console.error('Error al crear paciente', error);
      // Mostramos el mensaje de error que viene del backend (ej: documento duplicado)
      alert(error.response?.data?.message || 'Error al guardar el paciente');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link 
          href="/dashboard/patients"
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Nuevo Paciente</h1>
          <p className="text-sm text-slate-500">Ingrese los datos personales para registrar un nuevo paciente.</p>
        </div>
      </div>

      {/* Formulario */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Documento */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Documento / Cédula *</label>
              <input
                type="text"
                {...register('documentId')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Ej: 45678912"
              />
              {errors.documentId && <span className="text-red-500 text-xs mt-1 block">{errors.documentId.message}</span>}
            </div>

            {/* Fecha de Nacimiento */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Nacimiento *</label>
              <input
                type="date"
                {...register('birthDate')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {errors.birthDate && <span className="text-red-500 text-xs mt-1 block">{errors.birthDate.message}</span>}
            </div>

            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
              <input
                type="text"
                {...register('firstName')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {errors.firstName && <span className="text-red-500 text-xs mt-1 block">{errors.firstName.message}</span>}
            </div>

            {/* Apellido */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Apellido *</label>
              <input
                type="text"
                {...register('lastName')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {errors.lastName && <span className="text-red-500 text-xs mt-1 block">{errors.lastName.message}</span>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
              <input
                type="email"
                {...register('email')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="correo@ejemplo.com"
              />
              {errors.email && <span className="text-red-500 text-xs mt-1 block">{errors.email.message}</span>}
            </div>

            {/* Teléfono */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
              <input
                type="text"
                {...register('phone')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="+54 9 11 1234-5678"
              />
            </div>

            {/* Dirección (Ocupa las dos columnas) */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Dirección Física</label>
              <input
                type="text"
                {...register('address')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Calle Falsa 123, Ciudad"
              />
            </div>

          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
            <Link
              href="/dashboard/patients"
              className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center gap-2"
            >
              <Save size={20} />
              {isSubmitting ? 'Guardando...' : 'Guardar Paciente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}