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
  getAll: async (page: number = 1, limit: number = 10, month?: string, year?: string): Promise<PaginatedInvoices> => {
    const { data } = await api.get('/invoices', {
      params: { page, limit, month, year }
    });
    return data;
  },

  create: async (invoice: InvoiceFormValues) => {
    const { data } = await api.post('/invoices', invoice);
    return data;
  },

  cancel: async (id: string) => await api.patch('/invoices/' + id + '/cancel')
};