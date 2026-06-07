'use client';

import { useEffect, useState } from 'react';
import { invoicesService } from '@/services/invoices.service';
import { Invoice } from '@/schemas/invoice.schema';
import { Search, Plus, Receipt } from 'lucide-react';
import Link from 'next/link';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const data = await invoicesService.getAll();
        setInvoices(data);
      } catch (error) {
        console.error('Error cargando facturas:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvoices();
  }, []);

  // Filtramos por nombre, apellido o documento del paciente
  const filteredInvoices = invoices.filter((inv) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      inv.patient.firstName.toLowerCase().includes(searchLower) ||
      inv.patient.lastName.toLowerCase().includes(searchLower) ||
      inv.patient.documentId.includes(searchTerm)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header y Buscador */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Facturación</h1>
        
        <div className="flex w-full sm:w-auto gap-4">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por paciente o DNI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          
          <Link 
            href="/dashboard/invoices/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Nueva Factura</span>
          </Link>
        </div>
      </div>

      {/* Tabla de Facturas */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Nº Comprobante</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Paciente</th>
                <th className="px-6 py-4 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    Cargando facturas...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    No se encontraron facturas emitidas.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-700 flex items-center gap-2">
                      <Receipt size={16} className="text-slate-400" />
                      {/* Mostramos solo los primeros caracteres del ID para que parezca un código de factura */}
                      FAC-{invoice.id.split('-')[0].toUpperCase()}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(invoice.createdAt).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-800">
                      {invoice.patient.lastName}, {invoice.patient.firstName}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-emerald-600 font-bold">
                        ${invoice.totalAmount.toLocaleString('es-AR')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}