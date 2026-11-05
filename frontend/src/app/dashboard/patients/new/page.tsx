'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { patientSchema, PatientFormValues } from '@/schemas/patient.schema';
import { patientsService } from '@/services/patients.service';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { isAxiosError } from 'axios';
import { PARAGUAY_DEFAULTS } from '@/utils/domain-rules';
import { ErrorAlert } from '@/components/ui/PageState';

export default function NewPatientPage() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
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
    },
  });

  const onSubmit = async (data: PatientFormValues) => {
    setSubmitError(null);
    try {
      await patientsService.create(data);
      router.push('/dashboard/patients');
    } catch (error) {
      console.error('Error al crear paciente', error);
      if (isAxiosError(error)) {
        const msg = error.response?.data?.message;
        setSubmitError(
          Array.isArray(msg)
            ? msg.join(', ')
            : msg || 'Error al guardar el paciente.',
        );
      } else {
        setSubmitError('Error inesperado al guardar el paciente.');
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/patients"
          aria-label="Volver a Pacientes"
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
          <h1 className="text-2xl font-bold text-slate-800">Nuevo Paciente</h1>
          <p className="text-sm text-slate-500">
            Ingrese los datos personales para registrar un paciente en el padrón.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {submitError && <ErrorAlert message={submitError} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="new-patient-document"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                {PARAGUAY_DEFAULTS.documentLabel} *
              </label>
              <input
                id="new-patient-document"
                type="text"
                {...register('documentId')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder={PARAGUAY_DEFAULTS.documentPlaceholder}
              />
              {errors.documentId && (
                <span
                  role="alert"
                  className="text-red-500 text-xs mt-1 block"
                >
                  {errors.documentId.message}
                </span>
              )}
            </div>

            <div>
              <label
                htmlFor="new-patient-birthdate"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Fecha de Nacimiento *
              </label>
              <input
                id="new-patient-birthdate"
                type="date"
                {...register('birthDate')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {errors.birthDate && (
                <span
                  role="alert"
                  className="text-red-500 text-xs mt-1 block"
                >
                  {errors.birthDate.message}
                </span>
              )}
            </div>

            <div>
              <label
                htmlFor="new-patient-firstname"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Nombre *
              </label>
              <input
                id="new-patient-firstname"
                type="text"
                {...register('firstName')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {errors.firstName && (
                <span
                  role="alert"
                  className="text-red-500 text-xs mt-1 block"
                >
                  {errors.firstName.message}
                </span>
              )}
            </div>

            <div>
              <label
                htmlFor="new-patient-lastname"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Apellido *
              </label>
              <input
                id="new-patient-lastname"
                type="text"
                {...register('lastName')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {errors.lastName && (
                <span
                  role="alert"
                  className="text-red-500 text-xs mt-1 block"
                >
                  {errors.lastName.message}
                </span>
              )}
            </div>

            <div>
              <label
                htmlFor="new-patient-email"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Correo Electrónico (Opcional)
              </label>
              <input
                id="new-patient-email"
                type="email"
                {...register('email')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="correo@ejemplo.com.py"
              />
              {errors.email && (
                <span
                  role="alert"
                  className="text-red-500 text-xs mt-1 block"
                >
                  {errors.email.message}
                </span>
              )}
            </div>

            <div>
              <label
                htmlFor="new-patient-phone"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Teléfono
              </label>
              <input
                id="new-patient-phone"
                type="tel"
                {...register('phone')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder={PARAGUAY_DEFAULTS.phonePlaceholder}
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="new-patient-address"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Dirección Física
              </label>
              <input
                id="new-patient-address"
                type="text"
                {...register('address')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder={PARAGUAY_DEFAULTS.addressPlaceholder}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
            <Link
              href="/dashboard/patients"
              onClick={(e) => {
                if (
                  isDirty &&
                  !window.confirm('Tiene cambios sin guardar. ¿Desea cancelar?')
                ) {
                  e.preventDefault();
                }
              }}
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
