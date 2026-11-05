'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { patientsService } from '@/services/patients.service';
import { ArrowLeft, Save, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { formatCivilBirthDateInput } from '@/utils/format';
import { PARAGUAY_DEFAULTS } from '@/utils/domain-rules';
import { ErrorAlert, LoadingState } from '@/components/ui/PageState';
import { isAxiosError } from 'axios';

export default function EditPatientPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    documentId: '',
    email: '',
    phone: '',
    address: '',
    birthDate: '',
  });
  const [initialForm, setInitialForm] = useState(formData);

  useEffect(() => {
    let cancelled = false;
    const fetchPatient = async () => {
      try {
        const patient = await patientsService.getById(patientId);
        if (cancelled) return;
        const loaded = {
          firstName: patient.firstName,
          lastName: patient.lastName,
          documentId: patient.documentId,
          email: patient.email || '',
          phone: patient.phone || '',
          address: patient.address || '',
          birthDate: formatCivilBirthDateInput(patient.birthDate),
        };
        setFormData(loaded);
        setInitialForm(loaded);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error('Error cargando paciente:', error);
        setLoadError('No se pudo cargar la información del paciente.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void fetchPatient();
    return () => {
      cancelled = true;
    };
  }, [patientId, reloadKey]);

  const isDirty =
    formData.firstName !== initialForm.firstName ||
    formData.lastName !== initialForm.lastName ||
    formData.documentId !== initialForm.documentId ||
    formData.email !== initialForm.email ||
    formData.phone !== initialForm.phone ||
    formData.address !== initialForm.address ||
    formData.birthDate !== initialForm.birthDate;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        address: formData.address.trim() || null,
        birthDate: formData.birthDate,
      };

      await patientsService.update(patientId, payload);
      router.push('/dashboard/patients');
    } catch (error) {
      console.error('Error al actualizar:', error);
      if (isAxiosError(error)) {
        const msg = error.response?.data?.message;
        setSubmitError(
          Array.isArray(msg)
            ? msg.join(', ')
            : msg || 'Hubo un error al actualizar los datos del paciente.',
        );
      } else {
        setSubmitError('Hubo un error al actualizar los datos del paciente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Cargando datos del paciente..." />;
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
          href="/dashboard/patients"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft size={16} /> Volver a Pacientes
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
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
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <UserCircle className="text-amber-600" />
            Editar Paciente
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Modifique los datos personales o de contacto del paciente.
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <form onSubmit={handleSubmit} className="space-y-6">
          {submitError && <ErrorAlert message={submitError} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="edit-patient-firstname"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Nombre *
              </label>
              <input
                id="edit-patient-firstname"
                required
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="edit-patient-lastname"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Apellido *
              </label>
              <input
                id="edit-patient-lastname"
                required
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="edit-patient-document"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                {PARAGUAY_DEFAULTS.documentLabel} *
              </label>
              <input
                id="edit-patient-document"
                required
                type="text"
                name="documentId"
                value={formData.documentId}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="edit-patient-birthdate"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Fecha de Nacimiento *
              </label>
              <input
                id="edit-patient-birthdate"
                required
                type="date"
                name="birthDate"
                value={formData.birthDate}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="edit-patient-phone"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Teléfono
              </label>
              <input
                id="edit-patient-phone"
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder={PARAGUAY_DEFAULTS.phonePlaceholder}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="edit-patient-email"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Email (Opcional)
              </label>
              <input
                id="edit-patient-email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label
                htmlFor="edit-patient-address"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Dirección Física
              </label>
              <input
                id="edit-patient-address"
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder={PARAGUAY_DEFAULTS.addressPlaceholder}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
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
              className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors flex items-center gap-2 disabled:opacity-70"
            >
              <Save size={20} />
              {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
