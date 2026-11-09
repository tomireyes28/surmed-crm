'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/services/api';
import { isAxiosError } from 'axios';

export default function RecoverPage() {
  const [token, setToken] = useState('');
  const linkToken = useRef<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (linkToken.current === null)
      linkToken.current =
        new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    const timer = setTimeout(() => setToken(linkToken.current || ''), 0);
    window.history.replaceState(null, '', '/recover');
    return () => clearTimeout(timer);
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setMessage('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/recovery/redeem', { token, newPassword: password });
      setToken('');
      setPassword('');
      setConfirmation('');
      setMessage('Contraseña actualizada. Ya puede iniciar sesión.');
    } catch (error) {
      setMessage(
        isAxiosError(error)
          ? String(
              error.response?.data?.message ||
                'No se pudo restablecer el acceso.',
            )
          : 'Error de conexión.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="max-w-md mx-auto my-16 p-6 space-y-4 bg-white rounded-xl border">
      <h1 className="text-xl font-bold">Restablecer acceso</h1>
      <p>
        Use el enlace que le entregó el administrador tras verificar su
        identidad. Vence en 15 minutos y funciona una sola vez.
      </p>
      {message && <p role="status">{message}</p>}
      {token && (
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            Nueva contraseña
            <input
              className="block border p-2 w-full"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block">
            Repetir contraseña
            <input
              className="block border p-2 w-full"
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <button
            disabled={busy}
            className="bg-blue-600 text-white p-2 rounded"
          >
            {busy ? 'Guardando…' : 'Actualizar contraseña'}
          </button>
        </form>
      )}
      <Link className="underline" href="/">
        Volver al inicio de sesión
      </Link>
    </main>
  );
}
