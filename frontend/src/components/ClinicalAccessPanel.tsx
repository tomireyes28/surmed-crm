'use client';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { usersService, UserDoctor } from '@/services/users.service';
import { isAxiosError } from 'axios';

export function ClinicalAccessPanel({ patientId }: { patientId: string }) {
  const [doctors, setDoctors] = useState<UserDoctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    usersService
      .getDoctors()
      .then(setDoctors)
      .catch(() => setMessage('No se pudo cargar el equipo médico.'));
  }, []);
  async function manage(revoke: boolean) {
    setBusy(true);
    try {
      await api.post(`/medical-records/access/${revoke ? 'revoke' : 'grant'}`, {
        patientId,
        doctorId,
        reason,
      });
      setMessage(
        revoke
          ? 'Acceso revocado, incluidos turnos previos.'
          : 'Acceso asignado.',
      );
      setReason('');
    } catch (error) {
      setMessage(
        isAxiosError(error)
          ? String(
              error.response?.data?.message || 'No se pudo cambiar el acceso.',
            )
          : 'Error de conexión.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="border rounded-xl bg-white p-6 space-y-3">
      <h2 className="font-bold">Asignación de acceso clínico</h2>
      <p className="text-sm">
        ADMIN gestiona permisos sin acceder a la historia. Revocar bloquea
        también el acceso derivado de turnos; asignar lo habilita nuevamente.
      </p>
      <label className="block">
        Médico
        <select
          className="block border p-2 w-full"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
        >
          <option value="">Seleccione un médico</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Motivo
        <input
          className="block border p-2 w-full"
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="flex gap-3">
        <button
          disabled={busy || !doctorId || reason.trim().length < 10}
          onClick={() => void manage(false)}
          className="bg-blue-600 text-white p-2 rounded"
        >
          Asignar acceso
        </button>
        <button
          disabled={busy || !doctorId || reason.trim().length < 10}
          onClick={() => void manage(true)}
          className="border p-2 rounded"
        >
          Revocar acceso
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
