'use client';

export function PageNavigation({
  page,
  hasMore,
  busy,
  onChange,
}: {
  page: number;
  hasMore: boolean;
  busy: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Paginación"
      className="flex items-center justify-between gap-4 p-4 border-t"
    >
      <button
        type="button"
        disabled={busy || page <= 1}
        onClick={() => onChange(page - 1)}
        className="border rounded px-3 py-2 disabled:opacity-50"
      >
        Anterior
      </button>
      <span aria-live="polite">Página {page}</span>
      <button
        type="button"
        disabled={busy || !hasMore}
        onClick={() => onChange(page + 1)}
        className="border rounded px-3 py-2 disabled:opacity-50"
      >
        Siguiente
      </button>
    </nav>
  );
}
