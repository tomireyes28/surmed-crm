'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

export function LoadingState({ message = 'Cargando datos...' }: { message?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="px-6 py-10 text-center text-slate-500 flex items-center justify-center gap-2"
    >
      <Loader2 className="animate-spin text-blue-600" size={20} />
      <span>{message}</span>
    </div>
  );
}

export function ErrorAlert({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="p-4 bg-red-50 border border-red-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-red-700"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle size={20} className="shrink-0" />
        <p className="text-sm font-medium">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw size={14} />
          Reintentar
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-10 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
      {icon && <div className="text-slate-300 mb-1">{icon}</div>}
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
  );
}
