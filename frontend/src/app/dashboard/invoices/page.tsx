'use client';

import { useEffect, useState, useCallback } from 'react';
import { invoicesService } from '@/services/invoices.service';
import { Invoice } from '@/schemas/invoice.schema';
import {
  Search,
  Plus,
  Receipt,
  Download,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { generateInvoicePDF } from '@/utils/pdfGenerator';
import { formatClinicDate, formatPYG } from '@/utils/format';
import { isAxiosError } from 'axios';

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

  const fetchInvoices = useCallback(
    async (search?: string) => {
      try {
        setIsLoading(true);
        const response = await invoicesService.getAll(
          currentPage,
          limit,
          selectedMonth || undefined,
          selectedMonth ? selectedYear : undefined,
          search,
        );
        setInvoices(response.data);
        setTotalPages(Math.max(1, response.meta.totalPages));
      } catch (error) {
        console.error('Error cargando facturas:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [currentPage, selectedMonth, selectedYear],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchInvoices(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchInvoices, searchTerm]);

  const handlePay = async (id: string, invoiceNumber: string) => {
    const isConfirmed = window.confirm(
      `¿Confirmar el registro de cobro para el comprobante ${invoiceNumber}?`,
    );
    if (!isConfirmed) return;

    try {
      await invoicesService.pay(id);
      await fetchInvoices(searchTerm);
    } catch (error) {
      console.error('Error al registrar cobro:', error);
      const message = isAxiosError(error)
        ? error.response?.data?.message || 'Error al registrar el cobro.'
        : 'Ocurrió un error al registrar el cobro.';
      alert(message);
    }
  };

  const handleCancel = async (id: string, invoiceNumber: string) => {
    const reason = window.prompt(
      `¿Estás seguro de que deseas anular el comprobante ${invoiceNumber}? Ingrese el motivo de anulación (opcional):`,
      '',
    );
    if (reason === null) return;

    try {
      await invoicesService.cancel(id, reason.trim() || undefined);
      await fetchInvoices(searchTerm);
    } catch (error) {
      console.error('Error al anular:', error);
      const message = isAxiosError(error)
        ? error.response?.data?.message || 'Error al anular el comprobante.'
        : 'Ocurrió un error al intentar anular el comprobante.';
      alert(message);
    }
  };

  const months = [
    { value: '1', label: 'Enero' },
    { value: '2', label: 'Febrero' },
    { value: '3', label: 'Marzo' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Mayo' },
    { value: '6', label: 'Junio' },
    { value: '7', label: 'Julio' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">
          Comprobantes y Cobros
        </h1>

        <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-4">
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-8 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none h-full min-w-40"
            >
              <option value="">Todos los meses</option>
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label} {currentYear}
                </option>
              ))}
            </select>
            <Calendar
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
          </div>

          <div className="relative flex-1 sm:w-64">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Buscar paciente o documento..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <Link
            href="/dashboard/invoices/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Nuevo Comprobante</span>
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
                <th className="px-6 py-4 font-medium text-right">Total (PYG)</th>
                <th className="px-6 py-4 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    Cargando comprobantes...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    No se encontraron comprobantes emitidos.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {
                  const isCancelled = invoice.status === 'CANCELLED';
                  const isPaid = invoice.status === 'PAID';
                  const isPending = invoice.status === 'PENDING';
                  const invoiceNumber = `FAC-${invoice.id.split('-')[0].toUpperCase()}`;

                  return (
                    <tr
                      key={invoice.id}
                      className={`transition-colors group ${
                        isCancelled ? 'bg-slate-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td
                        className={`px-6 py-4 text-sm font-medium flex items-center gap-2 ${
                          isCancelled
                            ? 'text-slate-400 line-through'
                            : 'text-slate-700'
                        }`}
                      >
                        <Receipt
                          size={16}
                          className={
                            isCancelled ? 'text-slate-300' : 'text-slate-400'
                          }
                        />
                        {invoiceNumber}
                      </td>
                      <td
                        className={`px-6 py-4 text-sm ${
                          isCancelled ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {formatClinicDate(invoice.createdAt)}
                      </td>
                      <td
                        className={`px-6 py-4 text-sm ${
                          isCancelled ? 'text-slate-400' : 'text-slate-800'
                        }`}
                      >
                        {invoice.patient.lastName}, {invoice.patient.firstName}
                      </td>
                      <td className="px-6 py-4">
                        {isCancelled && (
                          <span className="px-2.5 py-1 text-[11px] font-semibold bg-red-100 text-red-700 rounded uppercase">
                            Anulada
                          </span>
                        )}
                        {isPaid && (
                          <span className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-100 text-emerald-700 rounded uppercase">
                            Cobrada
                          </span>
                        )}
                        {isPending && (
                          <span className="px-2.5 py-1 text-[11px] font-semibold bg-amber-100 text-amber-700 rounded uppercase">
                            Pendiente de Cobro
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`font-bold ${
                            isCancelled
                              ? 'text-slate-400 line-through'
                              : isPaid
                                ? 'text-emerald-600'
                                : 'text-amber-600'
                          }`}
                        >
                          {formatPYG(invoice.totalAmount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => generateInvoicePDF(invoice)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Descargar Comprobante PDF"
                          >
                            <Download size={18} />
                          </button>

                          {isPending && (
                            <button
                              onClick={() =>
                                handlePay(invoice.id, invoiceNumber)
                              }
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Registrar Cobro (Marcar como Pagada)"
                            >
                              <CheckCircle2 size={18} />
                            </button>
                          )}

                          {!isCancelled && (
                            <button
                              onClick={() =>
                                handleCancel(invoice.id, invoiceNumber)
                              }
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Anular Comprobante"
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
              Página <span className="font-medium text-slate-800">{currentPage}</span> de{' '}
              <span className="font-medium text-slate-800">{totalPages}</span>
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
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
