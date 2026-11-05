export type AppRole = 'ADMIN' | 'MEDICO' | 'RECEPCION';

export type AppointmentStatusType =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_WAITING_ROOM'
  | 'ATTENDED'
  | 'CANCELLED';

export type InvoiceStatusType = 'PENDING' | 'PAID' | 'CANCELLED';

export type ProductCategoryType = 'INSUMO_MEDICO' | 'OFICINA' | 'ACTIVO_FIJO';

export const PARAGUAY_DEFAULTS = {
  phonePlaceholder: '+595 981 123-456',
  documentLabel: 'Documento / C.I.',
  documentPlaceholder: 'Ej: 4.567.890 o Pasaporte',
  addressPlaceholder: 'Ej: Av. Mcal. López 1234, Asunción',
} as const;

export const ROLE_PERMISSIONS = {
  canViewFinancials: (role?: string | null) => role === 'ADMIN',
  canManageStaff: (role?: string | null) => role === 'ADMIN',
  canManageSpecialties: (role?: string | null) => role === 'ADMIN',
  canManageInventory: (role?: string | null) =>
    role === 'ADMIN' || role === 'RECEPCION',
  canManageInvoices: (role?: string | null) =>
    role === 'ADMIN' || role === 'RECEPCION',
  canArchivePatient: (role?: string | null) => role === 'ADMIN',
  canReactivatePatient: (role?: string | null) =>
    role === 'ADMIN' || role === 'RECEPCION',
  canReadClinicalHistory: (role?: string | null) =>
    role === 'MEDICO' || role === 'ADMIN',
  canCreateClinicalEvolution: (role?: string | null) => role === 'MEDICO',
} as const;

export const APPOINTMENT_STATUS_META: Record<
  AppointmentStatusType,
  {
    label: string;
    badgeClass: string;
    calendarColor: string;
    allowedNext: readonly AppointmentStatusType[];
  }
> = {
  PENDING: {
    label: 'Pendiente',
    badgeClass: 'bg-blue-100 text-blue-700',
    calendarColor: '#3b82f6',
    allowedNext: ['CONFIRMED', 'IN_WAITING_ROOM', 'CANCELLED'],
  },
  CONFIRMED: {
    label: 'Confirmado',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    calendarColor: '#10b981',
    allowedNext: ['IN_WAITING_ROOM', 'ATTENDED', 'CANCELLED'],
  },
  IN_WAITING_ROOM: {
    label: 'En Sala de Espera',
    badgeClass: 'bg-amber-100 text-amber-700',
    calendarColor: '#f59e0b',
    allowedNext: ['ATTENDED', 'CANCELLED'],
  },
  ATTENDED: {
    label: 'Atendido',
    badgeClass: 'bg-purple-100 text-purple-700',
    calendarColor: '#8b5cf6',
    allowedNext: [],
  },
  CANCELLED: {
    label: 'Cancelado',
    badgeClass: 'bg-red-100 text-red-700',
    calendarColor: '#ef4444',
    allowedNext: [],
  },
};

export const INVOICE_STATUS_META: Record<
  InvoiceStatusType,
  {
    label: string;
    badgeClass: string;
    amountClass: string;
  }
> = {
  PENDING: {
    label: 'Pendiente de Cobro',
    badgeClass: 'bg-amber-100 text-amber-700',
    amountClass: 'text-amber-600',
  },
  PAID: {
    label: 'Cobrada',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    amountClass: 'text-emerald-600',
  },
  CANCELLED: {
    label: 'Anulada',
    badgeClass: 'bg-red-100 text-red-700',
    amountClass: 'text-slate-400 line-through',
  },
};

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategoryType, string> = {
  INSUMO_MEDICO: 'Insumo Médico',
  OFICINA: 'Limpieza y Oficina',
  ACTIVO_FIJO: 'Mobiliario / Activos',
};

/**
 * Regla unificada de alerta de stock crítico entre Dashboard e Inventario (`F17`).
 */
export function isProductLowStock(product: {
  category?: string;
  quantity: number;
  minStock: number;
  isActive?: boolean;
}): boolean {
  if (product.isActive === false) return false;
  return (
    product.category === 'INSUMO_MEDICO' && product.quantity <= product.minStock
  );
}
