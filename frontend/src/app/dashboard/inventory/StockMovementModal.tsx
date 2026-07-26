import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { movementSchema, MovementFormValues, Product } from '@/schemas/inventory.schema';
import { inventoryService } from '@/services/inventory.service';
import { X, ArrowRightLeft } from 'lucide-react';
import { isAxiosError } from 'axios';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  // products: Product[]; Ya no necesitamos la lista completa si siempre pasamos un producto
  preSelectedProduct?: Product | null; 
  movementType?: 'IN' | 'OUT';
}

export function StockMovementModal({ isOpen, onClose, onSuccess, preSelectedProduct, movementType }: Props) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue } = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { 
      type: movementType || 'IN',
      quantity: 1,
    }
  });

  // Efecto para inicializar el formulario cuando se abre el modal con datos preseleccionados
  useEffect(() => {
    if (isOpen) {
      if (preSelectedProduct) {
        setValue('productId', preSelectedProduct.id);
      }
      if (movementType) {
        setValue('type', movementType);
        // Sugerencia de nota automática
        setValue('notes', movementType === 'IN' ? `Ingreso de stock` : `Uso interno`);
      }
    }
  }, [isOpen, preSelectedProduct, movementType, setValue]);

  if (!isOpen) return null;

  const onSubmit = async (data: MovementFormValues) => {
    try {
      await inventoryService.registerMovement(data);
      reset();
      onSuccess();
      onClose();
    } catch (error) { 
      console.error('Error al registrar movimiento', error);
      if (isAxiosError(error)) {
        alert(error.response?.data?.message || 'Error al registrar el movimiento');
      } else {
        alert('Error inesperado');
      }
    }
  };

  const isIncome = movementType === 'IN';

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
        
        {/* Cabecera del Modal - Cambia de color según si es ingreso o egreso */}
        <div className={`flex justify-between items-center p-6 border-b border-slate-100 ${isIncome ? 'bg-emerald-50' : 'bg-red-50'}`}>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft size={20} className={isIncome ? "text-emerald-600" : "text-red-600"} />
            {isIncome ? 'Ingreso de Stock' : 'Descuento de Stock'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          
          {/* Mostramos el producto seleccionado como texto, no como select, ya que viene pre-elegido */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Insumo Seleccionado</label>
            <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium">
              {preSelectedProduct?.name} <span className="text-slate-500 text-sm font-normal">(Stock Actual: {preSelectedProduct?.quantity})</span>
            </div>
            {/* Input oculto para que react-hook-form lo registre */}
            <input type="hidden" {...register('productId')} />
            {errors.productId && <span className="text-red-500 text-xs mt-1">{errors.productId.message}</span>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Movimiento</label>
              <div className={`w-full px-4 py-2 border border-slate-200 rounded-lg font-medium text-center ${isIncome ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
                {isIncome ? 'Entrada (IN)' : 'Salida (OUT)'}
              </div>
              {/* Input oculto */}
              <input type="hidden" {...register('type')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cantidad a {isIncome ? 'Sumar' : 'Restar'} *</label>
             <input 
                type="number" 
                {...register('quantity', { valueAsNumber: true })} 
                className={`w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 ${isIncome ? 'focus:ring-emerald-500 border-emerald-200' : 'focus:ring-red-500 border-red-200'}`} 
                min="1" 
              />
              {errors.quantity && <span className="text-red-500 text-xs mt-1">{errors.quantity.message}</span>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas (Opcional)</label>
            <input type="text" {...register('notes')} placeholder="Ej: Compra a proveedor..." className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-colors">
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting} 
              className={`px-4 py-2 text-white rounded-lg font-medium transition-colors disabled:opacity-50 ${isIncome ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {isSubmitting ? 'Guardando...' : (isIncome ? 'Confirmar Ingreso' : 'Confirmar Egreso')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}