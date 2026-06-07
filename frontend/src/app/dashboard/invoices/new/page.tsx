'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { invoiceSchema, InvoiceFormValues } from '@/schemas/invoice.schema';
import { invoicesService } from '@/services/invoices.service';
import { patientsService } from '@/services/patients.service';
import { Patient } from '@/schemas/patient.schema';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Save, Receipt } from 'lucide-react';
import { isAxiosError } from 'axios';

export default function NewInvoicePage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);

  // 1. Configuramos el formulario con 1 ítem vacío por defecto
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      patientId: '',
      items: [{ description: '', quantity: 1, unitPrice: 0 }],
    },
  });

  // 2. Extraemos las herramientas para manejar la lista dinámica de ítems
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const watchItems = useWatch({
    control,
    name: 'items',
  }) || [];

  const totalAmount = watchItems.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    return acc + (qty * price);
  }, 0);

  // Cargamos los pacientes para el Select
  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const data = await patientsService.getAll();
        setPatients(data);
      } catch (error) {
        console.error('Error cargando pacientes:', error);
      } finally {
        setIsLoadingPatients(false);
      }
    };
    fetchPatients();
  }, []);

  const onSubmit = async (data: InvoiceFormValues) => {
    try {
      await invoicesService.create(data);
      router.push('/dashboard/invoices');
    } catch (error) {
      console.error('Error al crear factura', error);
      if (isAxiosError(error)) {
        alert(error.response?.data?.message || 'Error al generar la factura');
      } else {
        alert('Error inesperado al facturar');
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link 
          href="/dashboard/invoices"
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Receipt className="text-blue-600" />
            Nueva Factura
          </h1>
          <p className="text-sm text-slate-500">Genere un nuevo cobro y agregue los ítems correspondientes.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Bloque 1: Datos del Paciente */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Datos del Cliente / Paciente</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Seleccionar Paciente *</label>
            <select
              {...register('patientId')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              disabled={isLoadingPatients}
            >
              <option value="">{isLoadingPatients ? 'Cargando pacientes...' : 'Seleccione un paciente...'}</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName} (DNI: {p.documentId})
                </option>
              ))}
            </select>
            {errors.patientId && <span className="text-red-500 text-xs mt-1">{errors.patientId.message}</span>}
          </div>
        </div>

        {/* Bloque 2: Ítems de la Factura */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
            <h2 className="font-bold text-slate-800">Líneas de Cobro</h2>
            <button
              type="button"
              onClick={() => append({ description: '', quantity: 1, unitPrice: 0 })}
              className="text-sm bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg font-medium hover:bg-slate-200 transition-colors flex items-center gap-1"
            >
              <Plus size={16} /> Agregar Ítem
            </button>
          </div>

          <div className="space-y-3">
            {/* Cabeceras de la tabla de ítems (ocultas en móvil) */}
            <div className="hidden sm:grid grid-cols-12 gap-4 text-sm font-medium text-slate-500 px-1">
              <div className="col-span-6">Descripción del servicio / insumo</div>
              <div className="col-span-2 text-center">Cantidad</div>
              <div className="col-span-3 text-right">Precio Unit. ($)</div>
              <div className="col-span-1"></div>
            </div>

            {/* Mapeo de campos dinámicos */}
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 items-start bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-lg sm:rounded-none">
                
                {/* Descripción */}
                <div className="col-span-1 sm:col-span-6">
                  <span className="text-xs font-medium text-slate-500 mb-1 block sm:hidden">Descripción</span>
                  <input
                    {...register(`items.${index}.description` as const)}
                    placeholder="Ej: Consulta cardiológica"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.items?.[index]?.description && (
                    <span className="text-red-500 text-xs mt-1 block">{errors.items[index]?.description?.message}</span>
                  )}
                </div>

                {/* Cantidad */}
                <div className="col-span-1 sm:col-span-2">
                  <span className="text-xs font-medium text-slate-500 mb-1 block sm:hidden">Cantidad</span>
                  <input
                    type="number"
                    {...register(`items.${index}.quantity` as const, { valueAsNumber: true })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-center"
                    min="1"
                  />
                  {errors.items?.[index]?.quantity && (
                    <span className="text-red-500 text-xs mt-1 block">{errors.items[index]?.quantity?.message}</span>
                  )}
                </div>

                {/* Precio Unitario */}
                <div className="col-span-1 sm:col-span-3">
                  <span className="text-xs font-medium text-slate-500 mb-1 block sm:hidden">Precio Unit.</span>
                  <input
                    type="number"
                    {...register(`items.${index}.unitPrice` as const, { valueAsNumber: true })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-right"
                    min="0"
                  />
                  {errors.items?.[index]?.unitPrice && (
                    <span className="text-red-500 text-xs mt-1 block">{errors.items[index]?.unitPrice?.message}</span>
                  )}
                </div>

                {/* Botón Borrar (Solo se muestra si hay más de 1 ítem) */}
                <div className="col-span-1 flex justify-end sm:justify-center items-center h-full pt-6 sm:pt-0">
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"
                      title="Eliminar línea"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Fila de Total */}
          <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end items-center gap-4">
            <span className="text-slate-500 font-medium">Total Estimado:</span>
            <span className="text-3xl font-bold text-emerald-600">
              ${totalAmount.toLocaleString('es-AR')}
            </span>
          </div>
        </div>

        {/* Botonera Guardar */}
        <div className="flex justify-end gap-3">
          <Link
            href="/dashboard/invoices"
            className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center gap-2"
          >
            <Save size={20} />
            {isSubmitting ? 'Generando...' : 'Emitir Factura'}
          </button>
        </div>
      </form>
    </div>
  );
}