'use client';

import { useEffect, useState, useCallback } from 'react';
import { invoicesService } from '@/services/invoices.service';
import { Invoice } from '@/schemas/invoice.schema';
import { Search, Plus, Receipt, Download, Ban } from 'lucide-react';
import Link from 'next/link';
import { generateInvoicePDF } from '@/utils/pdfGenerator';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchInvoices = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await invoicesService.getAll();
      setInvoices(data);
    } catch (error) {
      console.error('Error cargando facturas:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await fetchInvoices();
    };
    load();
  }, [fetchInvoices]);

  // NUEVO: Función para anular la factura
  const handleCancel = async (id: string, invoiceNumber: string) => {
    const isConfirmed = window.confirm(`¿Estás seguro de que deseas anular la factura ${invoiceNumber}? Esta acción no se puede deshacer y el monto dejará de sumar a los ingresos totales.`);
    
    if (isConfirmed) {
      try {
        await invoicesService.cancel(id);
        fetchInvoices();
      } catch (error) {
        console.error('Error al anular:', error);
        alert('Ocurrió un error al intentar anular la factura.');
      }
    }
  };

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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Nº Comprobante</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Paciente</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-right">Total</th>
                <th className="px-6 py-4 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Cargando facturas...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No se encontraron facturas emitidas.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => {
                  const isCancelled = invoice.status === 'CANCELLED';
                  const invoiceNumber = `FAC-${invoice.id.split('-')[0].toUpperCase()}`;
                  
                  return (
                    <tr key={invoice.id} className={`transition-colors group ${isCancelled ? 'bg-slate-50/50' : 'hover:bg-slate-50'}`}>
                      <td className={`px-6 py-4 text-sm font-medium flex items-center gap-2 ${isCancelled ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        <Receipt size={16} className={isCancelled ? 'text-slate-300' : 'text-slate-400'} />
                        {invoiceNumber}
                      </td>
                      <td className={`px-6 py-4 text-sm ${isCancelled ? 'text-slate-400' : 'text-slate-500'}`}>
                        {new Date(invoice.createdAt).toLocaleDateString('es-AR')}
                      </td>
                      <td className={`px-6 py-4 text-sm ${isCancelled ? 'text-slate-400' : 'text-slate-800'}`}>
                        {invoice.patient.lastName}, {invoice.patient.firstName}
                      </td>
                      <td className="px-6 py-4">
                        {isCancelled ? (
                          <span className="px-2 py-1 text-[10px] font-semibold bg-red-100 text-red-700 rounded uppercase">Anulada</span>
                        ) : (
                          <span className="px-2 py-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded uppercase">Emitida</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-bold ${isCancelled ? 'text-slate-400 line-through' : 'text-emerald-600'}`}>
                          ${invoice.totalAmount.toLocaleString('es-AR')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {/* El botón de descargar siempre está */}
                          <button
                            onClick={() => generateInvoicePDF(invoice)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Descargar PDF"
                          >
                            <Download size={18} />
                          </button>
                          
                          {/* El botón de anular solo aparece si no está anulada */}
                          {!isCancelled && (
                            <button
                              onClick={() => handleCancel(invoice.id, invoiceNumber)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                              title="Anular Factura"
                            >
                              <Ban size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}