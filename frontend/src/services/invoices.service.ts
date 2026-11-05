import { api } from './api';
import { Invoice, InvoiceFormValues } from '../schemas/invoice.schema';

export interface PaginatedInvoices {
  data: Invoice[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const invoicesService = {
  getAll: async (
    page: number = 1,
    limit: number = 10,
    month?: string,
    year?: string,
    search?: string,
    status?: string,
  ): Promise<PaginatedInvoices> => {
    const trimmedSearch = search?.trim();
    const { data } = await api.get<PaginatedInvoices>('/invoices', {
      params: {
        page,
        limit,
        ...(month ? { month } : {}),
        ...(year ? { year } : {}),
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
        ...(status ? { status } : {}),
      },
    });
    return data;
  },

  create: async (invoice: InvoiceFormValues, idempotencyKey?: string) => {
    const { data } = await api.post<Invoice>('/invoices', invoice, {
      headers: idempotencyKey
        ? { 'Idempotency-Key': idempotencyKey }
        : undefined,
    });
    return data;
  },

  pay: async (id: string) => {
    const { data } = await api.patch<Invoice>(`/invoices/${id}/pay`);
    return data;
  },

  cancel: async (id: string, reason?: string) => {
    const { data } = await api.patch<Invoice>(`/invoices/${id}/cancel`, {
      reason,
    });
    return data;
  },
};
