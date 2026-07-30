'use client';

import { useEffect, useState, useCallback } from 'react';
import { invoicesService } from '@/services/invoices.service';
import { Invoice } from '@/schemas/invoice.schema';
import { Search, Plus, Receipt, Download, Ban, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import Link from 'next/link';
import { generateInvoicePDF } from '@/utils/pdfGenerator';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;
  
  const currentYear = new Date().getFullYear().toString();
  const [selectedMonth, setSelectedMonth] = useState<string>(''); 
  const [selectedYear] = useState<string>(currentYear);

  const fetchInvoices = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await invoicesService.getAll(
        currentPage, 
        limit, 
        selectedMonth || undefined, 
        selectedMonth ? selectedYear : undefined
      );
      setInvoices(response.data);
      setTotalPages(response.meta.totalPages);
    } catch (error) {
      console.error('Error cargando facturas:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, selectedMonth, selectedYear]);

  useEffect(() => {
    // Apagamos la regla del linter solo para esta línea porque es un falso positivo
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInvoices();
  }, [fetchInvoices]);

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

  const months = [
    { value: '1', label: 'Enero' }, { value: '2', label: 'Febrero' }, { value: '3', label: 'Marzo' },
    { value: '4', label: 'Abril' }, { value: '5', label: 'Mayo' }, { value: '6', label: 'Junio' },
    { value: '7', label: 'Julio' }, { value: '8', label: 'Agosto' }, { value: '9', label: 'Septiembre' },
    { value: '10', label: 'Octubre' }, { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Facturación</h1>
        
        <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-4">
          
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setCurrentPage(1); 
              }}
              // Arreglado el min-w-40 de Tailwind
              className="pl-10 pr-8 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none h-full min-w-40"
            >
              <option value="">Todos los meses</option>
              {months.map(m => (
                <option key={m.value} value={m.value}>{m.label} {currentYear}</option>
              ))}
            </select>
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          </div>

          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Buscar paciente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          
          <Link 
            href="/dashboard/invoices/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Nueva Factura</span>
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
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
                          <button
                            onClick={() => generateInvoicePDF(invoice)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Descargar PDF"
                          >
                            <Download size={18} />
                          </button>
                          
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

        {!isLoading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
            <span className="text-sm text-slate-500">
              Página <span className="font-medium text-slate-800">{currentPage}</span> de <span className="font-medium text-slate-800">{totalPages}</span>
            </span>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}