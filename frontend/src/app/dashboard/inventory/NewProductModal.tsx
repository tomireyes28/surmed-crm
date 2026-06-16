import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productSchema, ProductFormValues } from '@/schemas/inventory.schema';
import { inventoryService } from '@/services/inventory.service';
import { X, Save } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewProductModal({ isOpen, onClose, onSuccess }: Props) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      category: 'INSUMO_MEDICO' // Valor por defecto
    }
  });

  if (!isOpen) return null;

  const onSubmit = async (data: ProductFormValues) => {
    try {
      await inventoryService.createProduct(data);
      reset(); // Limpiamos el formulario
      onSuccess(); // Le avisamos a la tabla que recargue los datos
      onClose(); // Cerramos el modal
    } catch (error) {
      console.error('Error al crear producto', error);
      alert('Error al guardar el insumo');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800">Nuevo Insumo</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
            <input type="text" {...register('name')} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
            {errors.name && <span className="text-red-500 text-xs mt-1">{errors.name.message}</span>}
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Categoría *</label>
            <select {...register('category')} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="INSUMO_MEDICO">Insumo Médico / Descartable</option>
              <option value="OFICINA">Limpieza y Oficina</option>
              <option value="ACTIVO_FIJO">Mobiliario y Equipamiento</option>
            </select>
            {errors.category && <span className="text-red-500 text-xs mt-1">{errors.category.message}</span>}
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <input type="text" {...register('description')} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Min Stock & Precio en Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stock Mín. *</label>
              <input type="number" {...register('minStock', { valueAsNumber: true })} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              {errors.minStock && <span className="text-red-500 text-xs mt-1">{errors.minStock.message}</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Precio Ref. ($)</label>
              <input type="number" {...register('price', { valueAsNumber: true })} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Botonera */}
          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center gap-2">
              <Save size={18} />
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}