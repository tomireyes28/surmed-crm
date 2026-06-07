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
  products: Product[]; // Recibimos la lista para el dropdown
}

export function StockMovementModal({ isOpen, onClose, onSuccess, products }: Props) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { type: 'IN' }
  });

  if (!isOpen) return null;

  const onSubmit = async (data: MovementFormValues) => {
    try {
      await inventoryService.registerMovement(data);
      reset();
      onSuccess();
      onClose();
    } catch (error) { // <-- Sacamos el : any
      console.error('Error al registrar movimiento', error);
      if (isAxiosError(error)) {
        alert(error.response?.data?.message || 'Error al registrar el movimiento');
      } else {
        alert('Error inesperado');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft size={20} className="text-blue-600" />
            Movimiento de Stock
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Insumo *</label>
            <select {...register('productId')} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Seleccione un producto...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} (Stock: {p.quantity})</option>
              ))}
            </select>
            {errors.productId && <span className="text-red-500 text-xs mt-1">{errors.productId.message}</span>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Movimiento *</label>
              <select {...register('type')} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="IN">Ingreso (IN)</option>
                <option value="OUT">Egreso / Uso (OUT)</option>
              </select>
              {errors.type && <span className="text-red-500 text-xs mt-1">{errors.type.message}</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cantidad *</label>
             <input type="number" {...register('quantity', { valueAsNumber: true })} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" min="1" />
              {errors.quantity && <span className="text-red-500 text-xs mt-1">{errors.quantity.message}</span>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas (Opcional)</label>
            <input type="text" {...register('notes')} placeholder="Ej: Compra a proveedor, Uso en consultorio 1..." className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-400">
              {isSubmitting ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}