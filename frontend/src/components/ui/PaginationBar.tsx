'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export function PaginationBar({
  currentPage,
  totalPages,
  onPageChange,
  isLoading = false,
}: PaginationBarProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Paginación de listado"
      className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50"
    >
      <span className="text-sm text-slate-500">
        Página <span className="font-medium text-slate-800">{currentPage}</span>{' '}
        de <span className="font-medium text-slate-800">{totalPages}</span>
      </span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Página anterior"
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          disabled={currentPage <= 1 || isLoading}
          className="p-2 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          aria-label="Página siguiente"
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          disabled={currentPage >= totalPages || isLoading}
          className="p-2 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </nav>
  );
}
