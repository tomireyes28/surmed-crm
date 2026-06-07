import { api } from './api';
import { Invoice, InvoiceFormValues } from '../schemas/invoice.schema';

export const invoicesService = {
  getAll: async (): Promise<Invoice[]> => {
    const { data } = await api.get('/invoices');
    return data;
  },

  create: async (invoice: InvoiceFormValues) => {
    const { data } = await api.post('/invoices', invoice);
    return data;
  }
};