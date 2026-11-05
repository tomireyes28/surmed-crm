'use client';

import { useEffect, useState } from 'react';
import { invoicesService } from '@/services/invoices.service';
import { Invoice } from '@/schemas/invoice.schema';
import {
  Search,
  Plus,
  Receipt,
  Download,
  Ban,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { generateInvoicePDF } from '@/utils/pdfGenerator';
import { formatClinicDate, formatPYG } from '@/utils/format';
import { INVOICE_STATUS_META } from '@/utils/domain-rules';
import { ErrorAlert } from '@/components/ui/PageState';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { isAxiosError } from 'axios';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;

  const currentYearNum = new Date().getFullYear();
  const availableYears = [
    String(currentYearNum),
    String(currentYearNum - 1),
    String(currentYearNum - 2),
  ];

  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>(
    String(currentYearNum),
  );
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setIsLoading(true);
        const response = await invoicesService.getAll(
          currentPage,
          limit,
          selectedMonth || undefined,
          selectedYear || undefined,
          searchTerm,
          selectedStatus || undefined,
        );
        if (cancelled) return;
        setInvoices(response.data);
        setTotalPages(Math.max(1, response.meta.totalPages));
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error('Error cargando comprobantes:', error);
        setLoadError(
          'No se pudieron cargar los comprobantes. Verifique la conexión.',
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    currentPage,
    selectedMonth,
    selectedYear,
    selectedStatus,
    searchTerm,
    reloadKey,
  ]);

  const handlePay = async (id: string, invoiceNumber: string) => {
    const isConfirmed = window.confirm(
      `¿Confirmar el registro de cobro para el comprobante ${invoiceNumber}?`,
    );
    if (!isConfirmed) return;

    try {
      await invoicesService.pay(id);
      setReloadKey((k) => k + 1);
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
      `¿Está seguro de que desea anular el comprobante ${invoiceNumber}? Ingrese el motivo de anulación:`,
      '',
    );
    if (reason === null) return;

    try {
      await invoicesService.cancel(id, reason.trim() || undefined);
      setReloadKey((k) => k + 1);
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
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Comprobantes y Cobros
          </h1>
          <p className="text-sm text-slate-500">
            Control de comprobantes internos emitidos, cobrados y anulados en Guaraníes (PYG).
          </p>
        </div>

        <div className="flex flex-wrap w-full lg:w-auto gap-3">
          <div className="relative">
            <select
              aria-label="Filtrar por año"
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                if (!e.target.value) setSelectedMonth('');
                setCurrentPage(1);
              }}
              className="pl-3 pr-8 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
            >
              <option value="">Todos los años</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  Año {y}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <select
              aria-label="Filtrar por mes"
              value={selectedMonth}
              disabled={!selectedYear}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 pr-8 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm disabled:opacity-50"
            >
              <option value="">Todos los meses</option>
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <Calendar
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              size={16}
            />
          </div>

          <div>
            <select
              aria-label="Filtrar por estado de cobro"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="PENDING">Pendientes de Cobro</option>
              <option value="PAID">Cobradas</option>
              <option value="CANCELLED">Anuladas</option>
            </select>
          </div>

          <div className="relative flex-1 sm:w-56">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              type="search"
              aria-label="Buscar comprobante por paciente o documento"
              placeholder="Paciente o documento..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
            />
          </div>

          <Link
            href="/dashboard/invoices/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 whitespace-nowrap text-sm shadow-sm"
          >
            <Plus size={18} />
            <span>Nuevo Comprobante</span>
          </Link>
        </div>
      </div>

      {loadError && (
        <ErrorAlert
          message={loadError}
          onRetry={() => {
            setIsLoading(true);
            setLoadError(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

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
                    No se encontraron comprobantes emitidos para el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {
                  const isCancelled = invoice.status === 'CANCELLED';
                  const isPending = invoice.status === 'PENDING';
                  const invoiceNumber = `FAC-${invoice.id.split('-')[0].toUpperCase()}`;
                  const statusMeta =
                    INVOICE_STATUS_META[invoice.status] ??
                    INVOICE_STATUS_META.PENDING;

                  return (
                    <tr
                      key={invoice.id}
                      className={`transition-colors ${
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
                        <span
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded uppercase ${statusMeta.badgeClass}`}
                        >
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-bold ${statusMeta.amountClass}`}>
                          {formatPYG(invoice.totalAmount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => void generateInvoicePDF(invoice)}
                            aria-label={`Descargar PDF de ${invoiceNumber}`}
                            title="Descargar Comprobante PDF"
                            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Download size={18} />
                          </button>

                          {isPending && (
                            <button
                              type="button"
                              onClick={() =>
                                void handlePay(invoice.id, invoiceNumber)
                              }
                              aria-label={`Registrar cobro de ${invoiceNumber}`}
                              title="Registrar Cobro (Marcar como Pagada)"
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <CheckCircle2 size={18} />
                            </button>
                          )}

                          {!isCancelled && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleCancel(invoice.id, invoiceNumber)
                              }
                              aria-label={`Anular comprobante ${invoiceNumber}`}
                              title="Anular Comprobante"
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          isLoading={isLoading}
          onPageChange={(page) => setCurrentPage(page)}
        />
      </div>
    </div>
  );
}
