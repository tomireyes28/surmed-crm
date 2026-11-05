'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  titleId: string;
  isDirty?: boolean;
  maxWidthClass?: string;
  headerClassName?: string;
  headerIcon?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Contenedor de modal accesible (`T14`):
 * - `role="dialog"`, `aria-modal="true"`, `aria-labelledby={titleId}`
 * - Foco inicial dentro del diálogo y retorno al elemento disparador al cerrar
 * - Trampa de foco circular con `Tab` / `Shift+Tab`
 * - Cierre con tecla `Escape` y protección de cambios sin guardar (`isDirty`)
 */
export function AccessibleModal({
  isOpen,
  onClose,
  title,
  titleId,
  isDirty = false,
  maxWidthClass = 'max-w-lg',
  headerClassName = 'bg-white',
  headerIcon,
  children,
}: AccessibleModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const attemptClose = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm(
        'Tiene cambios sin guardar en este formulario. ¿Desea descartarlos y cerrar?',
      );
      if (!confirmed) return;
    }
    onClose();
  }, [isDirty, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const timer = setTimeout(() => {
      const container = dialogRef.current;
      if (!container) return;
      const firstInput = container.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
      );
      firstInput?.focus();
    }, 10);

    return () => {
      clearTimeout(timer);
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        attemptClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, attemptClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          attemptClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white rounded-xl shadow-lg w-full ${maxWidthClass} overflow-hidden flex flex-col max-h-[90vh]`}
      >
        <div
          className={`flex justify-between items-center p-6 border-b border-slate-100 ${headerClassName}`}
        >
          <h2
            id={titleId}
            className="text-xl font-bold text-slate-800 flex items-center gap-2"
          >
            {headerIcon}
            {title}
          </h2>
          <button
            type="button"
            onClick={attemptClose}
            aria-label="Cerrar ventana modal"
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X size={22} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
